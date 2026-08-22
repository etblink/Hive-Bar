'use strict';

const {
  requireConnectionCursor,
  requireCommunitySort,
  requireHiveAccount,
  requirePageCursor,
  requirePermlink,
} = require('../http/validation');
const { NotFoundError } = require('../lib/errors');
const { parseAsset } = require('./assets');
const {
  HISTORY_PAGE_SIZE,
  TRANSFER_OPERATION_FILTER,
  createMessagePage,
  parseHistoryCursor,
} = require('./messages');
const {
  normalizeCommunity,
  normalizeContent,
  normalizeDiscussion,
  normalizeProfile,
} = require('./normalizers');
const { parsePostingMetadata, readProfileSettings } = require('./profile-settings');
const { calculateWalletSummary } = require('./wallet');

const DEFAULT_PAGE_SIZE = 10;

function encodePageCursor(item) {
  return Buffer.from(
    JSON.stringify({ author: item.author, permlink: item.permlink }),
    'utf8',
  ).toString('base64url');
}

function encodeConnectionCursor(accountValue) {
  const account = requireHiveAccount(accountValue, 'Connection account');
  return Buffer.from(JSON.stringify({ account }), 'utf8').toString('base64url');
}

function connectionNames(rawItems, field, anchor) {
  const names = [];
  const seen = new Set();
  for (const item of rawItems) {
    let name;
    try {
      name = requireHiveAccount(item?.[field], 'Connected account');
    } catch {
      continue;
    }
    if (name === anchor || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function transactionOperationTuple(operation) {
  if (Array.isArray(operation) && operation.length === 2) return operation;
  if (operation && typeof operation === 'object' && typeof operation.type === 'string') {
    return [operation.type.replace(/_operation$/, ''), operation.value || {}];
  }
  return [null, null];
}

function assetEquivalent(left, right, symbol) {
  const parsedLeft = parseAsset(left, symbol);
  const parsedRight = parseAsset(right, symbol);
  return Boolean(parsedLeft && parsedRight && parsedLeft.units === parsedRight.units);
}

function operationEquivalent(expected, actual) {
  const [expectedType, expectedValue] = transactionOperationTuple(expected);
  const [actualType, actualValue] = transactionOperationTuple(actual);
  if (!expectedType || expectedType !== actualType) return false;

  if (expectedType === 'account_update2') {
    return (
      expectedValue.account === actualValue.account &&
      expectedValue.posting_json_metadata === actualValue.posting_json_metadata
    );
  }
  if (expectedType === 'claim_reward_balance') {
    return (
      expectedValue.account === actualValue.account &&
      assetEquivalent(expectedValue.reward_hive, actualValue.reward_hive, 'HIVE') &&
      assetEquivalent(expectedValue.reward_hbd, actualValue.reward_hbd, 'HBD') &&
      assetEquivalent(expectedValue.reward_vests, actualValue.reward_vests, 'VESTS')
    );
  }
  if (expectedType === 'transfer') {
    return (
      expectedValue.from === actualValue.from &&
      expectedValue.to === actualValue.to &&
      assetEquivalent(expectedValue.amount, actualValue.amount, 'HBD') &&
      expectedValue.memo === actualValue.memo
    );
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function isUnknownTransaction(error, transactionId) {
  return (
    Number(error?.code) === -32003 &&
    String(error?.message || '').toLowerCase().includes(
      `unknown transaction ${String(transactionId).toLowerCase()}`,
    )
  );
}

class HiveReadService {
  constructor(
    rpcPool,
    { now = Date.now, pageSize = DEFAULT_PAGE_SIZE, messageHistoryPageSize = HISTORY_PAGE_SIZE } = {},
  ) {
    if (!rpcPool || typeof rpcPool.call !== 'function') {
      throw new TypeError('HiveReadService requires an RPC pool');
    }
    this.rpcPool = rpcPool;
    this.now = now;
    this.pageSize = Math.min(25, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
    this.messageHistoryPageSize = Math.min(
      100,
      Math.max(5, Number(messageHistoryPageSize) || HISTORY_PAGE_SIZE),
    );
  }

  async getCommunity(name) {
    const raw = await this.rpcPool.call('bridge', 'get_community', { name });
    return raw?.name ? normalizeCommunity(raw) : null;
  }

  async getCommunityPosts({
    name,
    sort = 'created',
    cursor: cursorValue = null,
    excludeContent = null,
    contentFilter = null,
    scanPageLimit = 5,
  }) {
    const cursor = requirePageCursor(cursorValue);
    const activeSort = requireCommunitySort(sort);
    const exclusion = excludeContent
      ? {
          author: requireHiveAccount(excludeContent.author, 'Excluded content author'),
          permlink: requirePermlink(excludeContent.permlink),
        }
      : null;
    if (contentFilter !== null && typeof contentFilter !== 'function') {
      throw new TypeError('Community content filter must be a function');
    }
    if (contentFilter) {
      return this.#filteredCommunityPage({
        name,
        sort: activeSort,
        cursor,
        exclusion,
        contentFilter,
        scanPageLimit,
      });
    }

    const params = {
      tag: name,
      sort: activeSort,
      limit: this.pageSize + (cursor ? 2 : 1) + (exclusion ? 1 : 0),
    };
    if (cursor) {
      params.start_author = cursor.author;
      params.start_permlink = cursor.permlink;
    }

    const raw = await this.rpcPool.call('bridge', 'get_ranked_posts', params);
    return this.#contentPage(Array.isArray(raw) ? raw : [], cursor, activeSort, exclusion);
  }

  async #filteredCommunityPage({
    name,
    sort,
    cursor,
    exclusion,
    contentFilter,
    scanPageLimit,
  }) {
    const visible = [];
    const rounds = Math.min(10, Math.max(1, Number(scanPageLimit) || 5));
    const rawPageSize = Math.min(100, Math.max(this.pageSize + 1, this.pageSize * 3));
    let anchor = cursor;
    let continuation = null;
    let exhausted = false;

    for (let round = 0; round < rounds; round += 1) {
      const params = {
        tag: name,
        sort,
        limit: rawPageSize + (anchor ? 1 : 0),
      };
      if (anchor) {
        params.start_author = anchor.author;
        params.start_permlink = anchor.permlink;
      }
      const rawResult = await this.rpcPool.call('bridge', 'get_ranked_posts', params);
      const raw = Array.isArray(rawResult) ? rawResult : [];
      const withoutAnchor = anchor
        ? raw.filter(
            (item) => item.author !== anchor.author || item.permlink !== anchor.permlink,
          )
        : raw;
      const rawTail = withoutAnchor[withoutAnchor.length - 1] || null;

      for (const item of withoutAnchor) {
        if (
          exclusion &&
          item.author === exclusion.author &&
          item.permlink === exclusion.permlink
        ) {
          continue;
        }
        const normalized = normalizeContent(item);
        if (contentFilter(normalized)) visible.push(normalized);
        if (visible.length > this.pageSize) break;
      }
      if (visible.length > this.pageSize) break;

      const requested = rawPageSize + (anchor ? 1 : 0);
      if (raw.length < requested || !rawTail) {
        exhausted = true;
        break;
      }
      anchor = { author: rawTail.author, permlink: rawTail.permlink };
      continuation = encodePageCursor(anchor);
    }

    const items = visible.slice(0, this.pageSize);
    const profiles = await this.getProfiles([...new Set(items.map((item) => item.author))]);
    let nextCursor = null;
    if (visible.length > this.pageSize && items.length > 0) {
      nextCursor = encodePageCursor(items[items.length - 1]);
    } else if (!exhausted && continuation) {
      nextCursor = continuation;
    }

    return { items, profiles, sort, nextCursor };
  }

  async getOfficialCommunityPosts({ account, community, limit = 3 }) {
    const author = requireHiveAccount(account, 'Official bar account');
    const tag = String(community || '').trim();
    if (!/^hive-[0-9]{3,12}$/.test(tag)) {
      throw new TypeError('Official bar community is invalid');
    }
    const boundedLimit = Math.min(6, Math.max(1, Number(limit) || 3));
    const raw = await this.rpcPool.call('bridge', 'get_ranked_posts', {
      tag,
      sort: 'created',
      limit: 25,
    });

    return (Array.isArray(raw) ? raw : [])
      .filter((item) => item?.author === author && item?.parent_author === '')
      .slice(0, boundedLimit)
      .map(normalizeContent);
  }

  async getAccountPosts({ account, cursor: cursorValue = null }) {
    const username = requireHiveAccount(account);
    const cursor = requirePageCursor(cursorValue);
    const params = {
      sort: 'posts',
      account: username,
      limit: this.pageSize + (cursor ? 2 : 1),
    };
    if (cursor) {
      params.start_author = cursor.author;
      params.start_permlink = cursor.permlink;
    }
    const raw = await this.rpcPool.call('bridge', 'get_account_posts', params);
    return this.#contentPage(Array.isArray(raw) ? raw : [], cursor, 'posts');
  }

  async #contentPage(rawItems, cursor, sort, exclusion = null) {
    const withoutAnchor = cursor
      ? rawItems.filter(
          (item) => item.author !== cursor.author || item.permlink !== cursor.permlink,
        )
      : rawItems;
    const visibleItems = exclusion
      ? withoutAnchor.filter(
          (item) => item.author !== exclusion.author || item.permlink !== exclusion.permlink,
        )
      : withoutAnchor;
    const normalized = visibleItems.map(normalizeContent);
    const hasNextPage = normalized.length > this.pageSize;
    const items = normalized.slice(0, this.pageSize);
    const profiles = await this.getProfiles([...new Set(items.map((item) => item.author))]);

    return {
      items,
      profiles,
      sort,
      nextCursor:
        hasNextPage && items.length > 0 ? encodePageCursor(items[items.length - 1]) : null,
    };
  }

  async getProfile(account) {
    const username = requireHiveAccount(account);
    const raw = await this.rpcPool.call('bridge', 'get_profile', { account: username });
    return raw?.name ? normalizeProfile(raw) : null;
  }

  async getProfiles(accounts) {
    const names = [...new Set(accounts.filter(Boolean).map((name) => requireHiveAccount(name)))];
    if (names.length === 0) return {};
    const raw = await this.rpcPool.call('bridge', 'get_profiles', { accounts: names });
    const profiles = Array.isArray(raw) ? raw.map(normalizeProfile) : [];
    return Object.fromEntries(profiles.filter((profile) => profile.name).map((profile) => [profile.name, profile]));
  }

  async getPostWithComments(authorValue, permlinkValue, { discussionFilter = null } = {}) {
    const author = requireHiveAccount(authorValue, 'Author');
    const permlink = requirePermlink(permlinkValue);
    if (discussionFilter !== null && typeof discussionFilter !== 'function') {
      throw new TypeError('Discussion filter must be a function');
    }
    const rawDiscussion = await this.rpcPool.call('bridge', 'get_discussion', {
      author,
      permlink,
    });
    let discussion = normalizeDiscussion(rawDiscussion, author, permlink);

    if (!discussion.post) {
      const rawPost = await this.rpcPool.call('bridge', 'get_post', { author, permlink });
      if (rawPost?.author) discussion = { ...discussion, post: normalizeContent(rawPost) };
    }
    if (!discussion.post) throw new NotFoundError('Post not found');
    if (discussionFilter) discussion = discussionFilter(discussion);
    if (!discussion?.post) throw new NotFoundError('Post not found');

    const profiles = await this.getProfiles([
      discussion.post.author,
      ...discussion.comments.map((comment) => comment.author),
    ]);
    return { ...discussion, profiles };
  }

  async getLatestThreadContainer(accountValue) {
    const account = requireHiveAccount(accountValue, 'Threads container account');
    const rawPosts = await this.rpcPool.call('bridge', 'get_account_posts', {
      sort: 'posts',
      account,
      limit: 1,
    });
    const containerRaw = Array.isArray(rawPosts)
      ? rawPosts.find((item) => item?.author === account && !item?.parent_author)
      : null;
    return containerRaw ? normalizeContent(containerRaw) : null;
  }

  async getLatestThreads(accountValue, { discussionFilter = null } = {}) {
    if (discussionFilter !== null && typeof discussionFilter !== 'function') {
      throw new TypeError('Discussion filter must be a function');
    }
    const container = await this.getLatestThreadContainer(accountValue);
    if (!container) return { container: null, threads: [], profiles: {} };

    const rawDiscussion = await this.rpcPool.call('bridge', 'get_discussion', {
      author: container.author,
      permlink: container.permlink,
    });
    let discussion = normalizeDiscussion(rawDiscussion, container.author, container.permlink);
    if (discussionFilter) discussion = discussionFilter(discussion);
    const profiles = await this.getProfiles(discussion.comments.map((comment) => comment.author));
    return { container, threads: discussion.comments, profiles };
  }

  async getWallet(accountValue) {
    const accountName = requireHiveAccount(accountValue);
    const [accounts, globalProperties, rcResult] = await Promise.all([
      this.rpcPool.call('condenser_api', 'get_accounts', [[accountName]]),
      this.rpcPool.call('condenser_api', 'get_dynamic_global_properties', []),
      this.rpcPool.call('rc_api', 'find_rc_accounts', { accounts: [accountName] }),
    ]);
    if (!Array.isArray(accounts) || !accounts[0]) throw new NotFoundError('Hive account not found');
    return calculateWalletSummary(accounts[0], globalProperties, rcResult, { nowMs: this.now() });
  }

  async getAccountRecord(accountValue) {
    const account = requireHiveAccount(accountValue);
    const accounts = await this.rpcPool.call('condenser_api', 'get_accounts', [[account]]);
    if (!Array.isArray(accounts) || !accounts[0]) throw new NotFoundError('Hive account not found');
    return accounts[0];
  }

  async getProfileSettings(accountValue, { defaultWallFee }) {
    const account = await this.getAccountRecord(accountValue);
    const parsed = parsePostingMetadata(account.posting_json_metadata);
    return {
      account: account.name,
      rawMetadata: parsed.raw,
      ...readProfileSettings(parsed, { defaultWallFee }),
    };
  }

  async getMessageHistory({
    account: accountValue,
    cursor: cursorValue = null,
    kind,
    minimumFee,
    globalExclusions = [],
    profileExclusions = [],
  }) {
    const account = requireHiveAccount(accountValue);
    const before = parseHistoryCursor(cursorValue);
    const start = before ?? -1;
    const limit = start === -1
      ? this.messageHistoryPageSize
      : Math.min(this.messageHistoryPageSize, start + 1);
    const raw = await this.rpcPool.call('account_history_api', 'get_account_history', {
      account,
      start,
      limit,
      include_reversible: false,
      operation_filter_low: TRANSFER_OPERATION_FILTER,
    });
    return createMessagePage(raw?.history, {
      account,
      minimumFee,
      globalExclusions,
      profileExclusions,
      kind,
      pageSize: limit,
    });
  }

  async getTransaction(transactionId) {
    return this.rpcPool.call('account_history_api', 'get_transaction', {
      id: transactionId,
      include_reversible: true,
    }, {
      acceptRpcError: (error) => isUnknownTransaction(error, transactionId),
    });
  }

  async observeM4Operation(record) {
    if (!/^[0-9a-f]{40}$/i.test(String(record?.transactionId || ''))) {
      return { observed: false, blockNumber: null };
    }
    const transaction = await this.getTransaction(record.transactionId);
    const actual = Array.isArray(transaction?.operations) ? transaction.operations : [];
    const expected = Array.isArray(record?.operations) ? record.operations : [];
    const matched =
      transaction?.transaction_id?.toLowerCase() === record.transactionId.toLowerCase() &&
      expected.length === actual.length &&
      expected.every((operation, index) => operationEquivalent(operation, actual[index]));
    return {
      observed: matched,
      blockNumber: matched && Number.isSafeInteger(transaction.block_num) ? transaction.block_num : null,
    };
  }

  async #connectionPage({ accountValue, cursorValue, method, field }) {
    const account = requireHiveAccount(accountValue);
    const cursor = requireConnectionCursor(cursorValue);
    const raw = await this.rpcPool.call('condenser_api', method, [
      account,
      cursor?.account || '',
      'blog',
      this.pageSize + (cursor ? 2 : 1),
    ]);
    const names = connectionNames(
      Array.isArray(raw) ? raw : [],
      field,
      cursor?.account || null,
    );
    const hasNextPage = names.length > this.pageSize;
    const pageNames = names.slice(0, this.pageSize);
    const profiles = await this.getProfiles(pageNames);
    const items = pageNames.map((name) => ({
      name,
      displayName: profiles[name]?.displayName || name,
      avatar: profiles[name]?.profileImage || `https://images.hive.blog/u/${name}/avatar/small`,
    }));

    return {
      items,
      nextCursor:
        hasNextPage && items.length > 0
          ? encodeConnectionCursor(items[items.length - 1].name)
          : null,
    };
  }

  async getFollowers(accountValue, cursorValue = null) {
    return this.#connectionPage({
      accountValue,
      cursorValue,
      method: 'get_followers',
      field: 'follower',
    });
  }

  async getFollowing(accountValue, cursorValue = null) {
    return this.#connectionPage({
      accountValue,
      cursorValue,
      method: 'get_following',
      field: 'following',
    });
  }

  async getFollowStatus(followerValue, followingValue) {
    const follower = requireHiveAccount(followerValue, 'Follower');
    const following = requireHiveAccount(followingValue, 'Following account');
    const raw = await this.rpcPool.call('condenser_api', 'get_following', [
      follower,
      following,
      'blog',
      1,
    ]);
    return Array.isArray(raw) && raw[0]?.following === following;
  }

  async isCommunityMember(accountValue, community) {
    const account = requireHiveAccount(accountValue);
    const raw = await this.rpcPool.call('bridge', 'get_community', {
      name: community,
      observer: account,
    });
    return Boolean(raw?.context?.subscribed);
  }

  async listCommunitySubscribers(community, last = '') {
    const params = { community, limit: 100 };
    if (last) params.last = requireHiveAccount(last, 'Last subscriber');
    const raw = await this.rpcPool.call('bridge', 'list_subscribers', params);
    return (Array.isArray(raw) ? raw : []).map((subscriber) => ({
      name: subscriber[0],
      role: subscriber[1],
      date: subscriber[3],
    }));
  }

  async observeSocialOperation(record) {
    const operation = record?.operations?.[0];
    const [type, value] = Array.isArray(operation) ? operation : [];

    if (type === 'comment') {
      const author = requireHiveAccount(value?.author, 'Operation author');
      const permlink = requirePermlink(value?.permlink);
      const raw = await this.rpcPool.call('bridge', 'get_post', { author, permlink });
      return raw?.author === author && raw?.permlink === permlink;
    }

    if (type === 'vote') {
      const voter = requireHiveAccount(value?.voter, 'Operation voter');
      const author = requireHiveAccount(value?.author, 'Vote target author');
      const permlink = requirePermlink(value?.permlink);
      const raw = await this.rpcPool.call('bridge', 'get_post', { author, permlink });
      const vote = Array.isArray(raw?.active_votes)
        ? raw.active_votes.find((item) => item?.voter === voter)
        : null;
      return Number(vote?.percent) === Number(value?.weight);
    }

    if (type === 'custom_json' && value?.id === 'follow') {
      const [, payload] = JSON.parse(value.json);
      const following = Array.isArray(payload?.what) && payload.what.includes('blog');
      return (await this.getFollowStatus(payload.follower, payload.following)) === following;
    }

    if (type === 'custom_json' && value?.id === 'community') {
      const [action, payload] = JSON.parse(value.json);
      const subscribed = action === 'subscribe';
      return (await this.isCommunityMember(record.account, payload.community)) === subscribed;
    }

    return false;
  }
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  HiveReadService,
  assetEquivalent,
  encodeConnectionCursor,
  encodePageCursor,
  isUnknownTransaction,
  operationEquivalent,
  transactionOperationTuple,
};
