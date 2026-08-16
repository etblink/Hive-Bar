'use strict';

const { createHash, randomBytes } = require('node:crypto');
const { requireHiveAccount, requirePermlink } = require('../http/validation');
const { ValidationError } = require('../lib/errors');

const LIMITS = Object.freeze({
  titleBytes: 256,
  postBodyBytes: 32 * 1024,
  threadBodyBytes: 500,
  commentBodyBytes: 8 * 1024,
  permlinkBytes: 256,
  metadataBytes: 8 * 1024,
  tagBytes: 24,
  tags: 10,
});
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const ACTIONS = new Set([
  'post',
  'thread',
  'comment',
  'vote',
  'follow',
  'unfollow',
  'subscribe',
  'unsubscribe',
]);

function utf8Bytes(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

function requireText(value, label, maxBytes, { trim = false } = {}) {
  const rawText = String(value ?? '');
  if (!rawText.trim()) throw new ValidationError(`${label} is required`);
  const text = trim ? rawText.trim() : rawText;
  const bytes = utf8Bytes(text);
  if (bytes > maxBytes) {
    throw new ValidationError(`${label} must be ${maxBytes.toLocaleString('en-US')} UTF-8 bytes or fewer`);
  }
  return text;
}

function requireOptionalTitle(value) {
  return requireText(value, 'Title', LIMITS.titleBytes, { trim: true });
}

function requireOperationPermlink(value) {
  const permlink = requirePermlink(value);
  if (utf8Bytes(permlink) > LIMITS.permlinkBytes) {
    throw new ValidationError(`Permlink must be ${LIMITS.permlinkBytes} UTF-8 bytes or fewer`);
  }
  return permlink;
}

function normalizeTags(values, communityId) {
  if (!Array.isArray(values)) throw new ValidationError('Tags must be an array');
  const normalized = values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set([communityId, ...normalized])];
  if (unique.length > LIMITS.tags) throw new ValidationError(`No more than ${LIMITS.tags} tags are allowed`);

  for (const tag of unique) {
    if (!TAG_PATTERN.test(tag) || utf8Bytes(tag) > LIMITS.tagBytes) {
      throw new ValidationError(
        `Each tag must be lowercase letters, numbers, or hyphens and at most ${LIMITS.tagBytes} UTF-8 bytes`,
      );
    }
  }
  return unique;
}

function metadata(value) {
  const encoded = JSON.stringify(value);
  if (utf8Bytes(encoded) > LIMITS.metadataBytes) {
    throw new ValidationError(`JSON metadata must be ${LIMITS.metadataBytes} UTF-8 bytes or fewer`);
  }
  return encoded;
}

function fingerprint(operations) {
  return createHash('sha256').update(JSON.stringify(operations), 'utf8').digest('hex');
}

function operationEnvelope(action, account, operations, summary) {
  return Object.freeze({
    action,
    account,
    authority: 'Posting',
    operations,
    fingerprint: fingerprint(operations),
    summary: Object.freeze(summary),
  });
}

function buildPost({ account: accountValue, payload, config }) {
  const account = requireHiveAccount(accountValue);
  const title = requireOptionalTitle(payload?.title);
  const body = requireText(payload?.body, 'Post body', LIMITS.postBodyBytes);
  const permlink = requireOperationPermlink(payload?.permlink);
  const tags = normalizeTags(payload?.tags, config.hive.communityId);
  const jsonMetadata = metadata({ tags, app: config.hive.appTag, format: 'markdown' });
  const operation = [
    'comment',
    {
      parent_author: '',
      parent_permlink: config.hive.communityId,
      author: account,
      permlink,
      title,
      body,
      json_metadata: jsonMetadata,
    },
  ];
  return operationEnvelope('post', account, [operation], {
    kind: 'Community post',
    author: account,
    community: config.hive.communityId,
    permlink,
    title,
    tags,
    bodyBytes: utf8Bytes(body),
  });
}

function buildThread({ account: accountValue, payload, config, threadContainer }) {
  const account = requireHiveAccount(accountValue);
  const body = requireText(payload?.body, 'Thread body', LIMITS.threadBodyBytes);
  const permlink = requireOperationPermlink(payload?.permlink);
  const parentAuthor = requireHiveAccount(threadContainer?.author, 'Thread container author');
  const parentPermlink = requireOperationPermlink(threadContainer?.permlink);
  if (parentAuthor !== config.hive.threadsContainerAccount) {
    throw new ValidationError('The resolved thread container does not match this deployment');
  }
  const jsonMetadata = metadata({
    tags: [config.hive.communityId, 'threads'],
    app: config.hive.appTag,
    format: 'markdown',
  });
  const operation = [
    'comment',
    {
      parent_author: parentAuthor,
      parent_permlink: parentPermlink,
      author: account,
      permlink,
      title: '',
      body,
      json_metadata: jsonMetadata,
    },
  ];
  return operationEnvelope('thread', account, [operation], {
    kind: 'Thread',
    author: account,
    parentAuthor,
    parentPermlink,
    permlink,
    bodyBytes: utf8Bytes(body),
  });
}

function buildComment({ account: accountValue, payload, config }) {
  const account = requireHiveAccount(accountValue);
  const body = requireText(payload?.body, 'Comment body', LIMITS.commentBodyBytes);
  const permlink = requireOperationPermlink(payload?.permlink);
  const parentAuthor = requireHiveAccount(payload?.parentAuthor, 'Parent author');
  const parentPermlink = requireOperationPermlink(payload?.parentPermlink);
  const jsonMetadata = metadata({ app: config.hive.appTag, format: 'markdown' });
  const operation = [
    'comment',
    {
      parent_author: parentAuthor,
      parent_permlink: parentPermlink,
      author: account,
      permlink,
      title: '',
      body,
      json_metadata: jsonMetadata,
    },
  ];
  return operationEnvelope('comment', account, [operation], {
    kind: 'Comment',
    author: account,
    parentAuthor,
    parentPermlink,
    permlink,
    bodyBytes: utf8Bytes(body),
  });
}

function requireVoteDirection(value) {
  const direction = String(value ?? 'upvote').trim().toLowerCase();
  if (direction !== 'upvote' && direction !== 'downvote') {
    throw new ValidationError('Vote direction must be upvote or downvote');
  }
  return direction;
}

function buildVote({ account: accountValue, payload }) {
  const account = requireHiveAccount(accountValue);
  const author = requireHiveAccount(payload?.author, 'Vote target author');
  const permlink = requireOperationPermlink(payload?.permlink);
  const direction = requireVoteDirection(payload?.direction);
  const percent = Number(payload?.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new ValidationError('Vote percentage must be a whole number from 1 to 100');
  }
  const weight = percent * 100 * (direction === 'downvote' ? -1 : 1);
  const operation = ['vote', { voter: account, author, permlink, weight }];
  return operationEnvelope('vote', account, [operation], {
    kind: direction === 'downvote' ? 'Downvote' : 'Upvote',
    voter: account,
    author,
    permlink,
    direction,
    percent,
    weight,
  });
}

function buildFollow({ account: accountValue, payload, following }) {
  const account = requireHiveAccount(accountValue);
  const target = requireHiveAccount(payload?.following, 'Account to follow');
  if (target === account) throw new ValidationError('An account cannot follow itself');
  const what = following ? ['blog'] : [];
  const action = following ? 'follow' : 'unfollow';
  const operation = [
    'custom_json',
    {
      required_auths: [],
      required_posting_auths: [account],
      id: 'follow',
      json: JSON.stringify(['follow', { follower: account, following: target, what }]),
    },
  ];
  return operationEnvelope(action, account, [operation], {
    kind: following ? 'Follow account' : 'Unfollow account',
    follower: account,
    following: target,
  });
}

function buildSubscription({ account: accountValue, config, subscribing }) {
  const account = requireHiveAccount(accountValue);
  const action = subscribing ? 'subscribe' : 'unsubscribe';
  const operation = [
    'custom_json',
    {
      required_auths: [],
      required_posting_auths: [account],
      id: 'community',
      json: JSON.stringify([action, { community: config.hive.communityId }]),
    },
  ];
  return operationEnvelope(action, account, [operation], {
    kind: subscribing ? 'Subscribe to community' : 'Unsubscribe from community',
    account,
    community: config.hive.communityId,
  });
}

function buildSocialOperation(action, options) {
  if (!ACTIONS.has(action)) throw new ValidationError('Social action is invalid');
  if (action === 'post') return buildPost(options);
  if (action === 'thread') return buildThread(options);
  if (action === 'comment') return buildComment(options);
  if (action === 'vote') return buildVote(options);
  if (action === 'follow') return buildFollow({ ...options, following: true });
  if (action === 'unfollow') return buildFollow({ ...options, following: false });
  return buildSubscription({ ...options, subscribing: action === 'subscribe' });
}

function createPermlink(value, { now = Date.now, random = randomBytes } = {}) {
  const slug = String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)
    .replace(/-+$/g, '') || 'hive-bar';
  const timestamp = new Date(now()).toISOString().replace(/[-:.TZ]/g, '').toLowerCase();
  const suffix = random(5).toString('hex');
  return `${slug}-${timestamp}-${suffix}`;
}

module.exports = {
  ACTIONS,
  LIMITS,
  buildComment,
  buildFollow,
  buildPost,
  buildSocialOperation,
  buildSubscription,
  buildThread,
  buildVote,
  createPermlink,
  fingerprint,
  normalizeTags,
  utf8Bytes,
};
