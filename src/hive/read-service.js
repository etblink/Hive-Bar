'use strict';

const {
  requireCommunitySort,
  requireHiveAccount,
  requirePageCursor,
  requirePermlink,
} = require('../http/validation');
const { NotFoundError } = require('../lib/errors');
const {
  normalizeCommunity,
  normalizeContent,
  normalizeDiscussion,
  normalizeProfile,
} = require('./normalizers');
const { calculateWalletSummary } = require('./wallet');

const DEFAULT_PAGE_SIZE = 10;

function encodePageCursor(item) {
  return Buffer.from(
    JSON.stringify({ author: item.author, permlink: item.permlink }),
    'utf8',
  ).toString('base64url');
}

class HiveReadService {
  constructor(rpcPool, { now = Date.now, pageSize = DEFAULT_PAGE_SIZE } = {}) {
    if (!rpcPool || typeof rpcPool.call !== 'function') {
      throw new TypeError('HiveReadService requires an RPC pool');
    }
    this.rpcPool = rpcPool;
    this.now = now;
    this.pageSize = Math.min(25, Math.max(1, Number(pageSize) || DEFAULT_PAGE_SIZE));
  }

  async getCommunity(name) {
    const raw = await this.rpcPool.call('bridge', 'get_community', { name });
    return raw?.name ? normalizeCommunity(raw) : null;
  }

  async getCommunityPosts({ name, sort = 'created', cursor: cursorValue = null }) {
    const cursor = requirePageCursor(cursorValue);
    const activeSort = requireCommunitySort(sort);
    const params = {
      tag: name,
      sort: activeSort,
      limit: this.pageSize + (cursor ? 2 : 1),
    };
    if (cursor) {
      params.start_author = cursor.author;
      params.start_permlink = cursor.permlink;
    }

    const raw = await this.rpcPool.call('bridge', 'get_ranked_posts', params);
    return this.#contentPage(Array.isArray(raw) ? raw : [], cursor, activeSort);
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

  async #contentPage(rawItems, cursor, sort) {
    const withoutAnchor = cursor
      ? rawItems.filter(
          (item) => item.author !== cursor.author || item.permlink !== cursor.permlink,
        )
      : rawItems;
    const normalized = withoutAnchor.map(normalizeContent);
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

  async getPostWithComments(authorValue, permlinkValue) {
    const author = requireHiveAccount(authorValue, 'Author');
    const permlink = requirePermlink(permlinkValue);
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

    const profiles = await this.getProfiles([
      discussion.post.author,
      ...discussion.comments.map((comment) => comment.author),
    ]);
    return { ...discussion, profiles };
  }

  async getLatestThreads(accountValue) {
    const account = requireHiveAccount(accountValue, 'Threads container account');
    const rawPosts = await this.rpcPool.call('bridge', 'get_account_posts', {
      sort: 'posts',
      account,
      limit: 1,
    });
    const containerRaw = Array.isArray(rawPosts)
      ? rawPosts.find((item) => item?.author === account && !item?.parent_author)
      : null;
    if (!containerRaw) return { container: null, threads: [], profiles: {} };

    const container = normalizeContent(containerRaw);
    const rawDiscussion = await this.rpcPool.call('bridge', 'get_discussion', {
      author: container.author,
      permlink: container.permlink,
    });
    const discussion = normalizeDiscussion(rawDiscussion, container.author, container.permlink);
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

  async getFollowers(accountValue, start = '', limit = 100) {
    const account = requireHiveAccount(accountValue);
    const raw = await this.rpcPool.call('condenser_api', 'get_followers', [
      account,
      start,
      'blog',
      Math.min(limit, 100),
    ]);
    return (Array.isArray(raw) ? raw : []).map((item) => ({
      name: item.follower,
      avatar: `https://images.hive.blog/u/${item.follower}/avatar/small`,
    }));
  }

  async getFollowing(accountValue, start = '', limit = 100) {
    const account = requireHiveAccount(accountValue);
    const raw = await this.rpcPool.call('condenser_api', 'get_following', [
      account,
      start,
      'blog',
      Math.min(limit, 100),
    ]);
    return (Array.isArray(raw) ? raw : []).map((item) => ({
      name: item.following,
      avatar: `https://images.hive.blog/u/${item.following}/avatar/small`,
    }));
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
}

module.exports = { DEFAULT_PAGE_SIZE, HiveReadService, encodePageCursor };
