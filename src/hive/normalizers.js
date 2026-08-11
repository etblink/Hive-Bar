'use strict';

const { plainTextExcerpt, renderMarkdown } = require('../content/markdown');
const { assetNumber } = require('./wallet');

function safeObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function positiveVoteCount(votes) {
  if (!Array.isArray(votes)) return 0;
  return votes.filter((vote) => {
    const rshares = Number(vote?.rshares);
    if (Number.isFinite(rshares) && rshares !== 0) return rshares > 0;
    const percent = Number(vote?.percent);
    return Number.isFinite(percent) && percent > 0;
  }).length;
}

function negativeVoteCount(votes) {
  if (!Array.isArray(votes)) return 0;
  return votes.filter((vote) => {
    const rshares = Number(vote?.rshares);
    if (Number.isFinite(rshares) && rshares !== 0) return rshares < 0;
    const percent = Number(vote?.percent);
    return Number.isFinite(percent) && percent < 0;
  }).length;
}

function normalizeContent(item = {}) {
  const author = typeof item.author === 'string' ? item.author : '';
  const body = typeof item.body === 'string' ? item.body : '';
  const pendingPayout = assetNumber(item.pending_payout_value);
  const paidPayout =
    assetNumber(item.total_payout_value) + assetNumber(item.curator_payout_value);
  const votes = Array.isArray(item.active_votes) ? item.active_votes : [];

  return {
    author,
    permlink: typeof item.permlink === 'string' ? item.permlink : '',
    parentAuthor: typeof item.parent_author === 'string' ? item.parent_author : '',
    parentPermlink: typeof item.parent_permlink === 'string' ? item.parent_permlink : '',
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'Untitled',
    bodyHtml: renderMarkdown(body),
    excerpt: plainTextExcerpt(body),
    created: typeof item.created === 'string' ? item.created : '',
    updated: typeof item.updated === 'string' ? item.updated : '',
    positiveVotes: positiveVoteCount(votes),
    negativeVotes: negativeVoteCount(votes),
    replyCount: Math.max(0, Number(item.children || item.stats?.children || 0) || 0),
    payout: pendingPayout + paidPayout,
    depth: Math.max(0, Math.min(6, Number(item.depth || 0) || 0)),
  };
}

function metadataProfile(raw = {}) {
  const bridgeMetadata = safeObject(raw.metadata);
  const legacyMetadata = safeObject(raw.json_metadata);
  const postingMetadata = safeObject(raw.posting_json_metadata);
  return {
    ...(safeObject(legacyMetadata.profile)),
    ...(safeObject(postingMetadata.profile)),
    ...(safeObject(bridgeMetadata.profile)),
  };
}

function safeProfileImage(rawUrl, account) {
  const fallback = `https://images.hive.blog/u/${account}/avatar`;
  if (typeof rawUrl !== 'string' || rawUrl.trim() === '') return fallback;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:' && parsed.hostname === 'images.hive.blog') {
      return parsed.toString();
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function normalizeProfile(raw = {}) {
  const account = typeof raw.name === 'string' ? raw.name : '';
  const profile = metadataProfile(raw);
  const stats = safeObject(raw.stats);
  const displayName =
    typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : account;

  return {
    name: account,
    displayName,
    about: typeof profile.about === 'string' ? profile.about.trim() : '',
    profileImage: safeProfileImage(profile.profile_image, account),
    followerCount: Math.max(0, Number(stats.followers ?? raw.follower_count ?? 0) || 0),
    followingCount: Math.max(0, Number(stats.following ?? raw.following_count ?? 0) || 0),
    postCount: Math.max(0, Number(raw.post_count ?? stats.post_count ?? 0) || 0),
    reputation: String(raw.reputation_ui ?? raw.reputation ?? '0'),
  };
}

function normalizeCommunity(raw = {}) {
  const about = typeof raw.about === 'string' ? raw.about : '';
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Hive community',
    aboutHtml: renderMarkdown(about),
    subscriberCount: Math.max(0, Number(raw.subscribers || 0) || 0),
    pendingRewards: assetNumber(raw.sum_pending),
  };
}

function normalizeDiscussion(rawDiscussion, rootAuthor, rootPermlink) {
  const entries = Array.isArray(rawDiscussion)
    ? rawDiscussion
    : Object.values(safeObject(rawDiscussion));
  const validEntries = entries.filter(
    (entry) => entry && typeof entry.author === 'string' && typeof entry.permlink === 'string',
  );
  const byKey = new Map(
    validEntries.map((entry) => [`${entry.author}/${entry.permlink}`, entry]),
  );
  const rootKey = `${rootAuthor}/${rootPermlink}`;
  const rootRaw = byKey.get(rootKey) || null;

  function depthFor(entry, seen = new Set()) {
    const key = `${entry.author}/${entry.permlink}`;
    if (key === rootKey) return 0;
    if (seen.has(key)) return 1;
    seen.add(key);
    const parent = byKey.get(`${entry.parent_author}/${entry.parent_permlink}`);
    return parent ? Math.min(6, depthFor(parent, seen) + 1) : 1;
  }

  const comments = validEntries
    .filter((entry) => `${entry?.author}/${entry?.permlink}` !== rootKey)
    .map((entry) => ({ ...normalizeContent(entry), depth: depthFor(entry) }))
    .sort((left, right) => String(left.created).localeCompare(String(right.created)));

  return {
    post: rootRaw ? normalizeContent(rootRaw) : null,
    comments,
  };
}

module.exports = {
  negativeVoteCount,
  normalizeCommunity,
  normalizeContent,
  normalizeDiscussion,
  normalizeProfile,
  positiveVoteCount,
  safeObject,
  safeProfileImage,
};
