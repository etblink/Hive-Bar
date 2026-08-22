'use strict';

const { FeatureUnavailableError, NotFoundError } = require('../lib/errors');
const {
  createModerationPolicy,
  filterDiscussionBranches,
  isCommunityRoot,
} = require('./policy');

class ModerationService {
  constructor({
    config,
    hiveReads,
    store = null,
    unavailableCause = null,
    scanPageLimit = 5,
  }) {
    this.config = config;
    this.hiveReads = hiveReads;
    this.store = store;
    this.unavailableCause = unavailableCause;
    this.scanPageLimit = Math.min(10, Math.max(1, Number(scanPageLimit) || 5));
    this.operatorAccounts = new Set(config.moderation.operatorAccounts);
  }

  isOperator(account) {
    return Boolean(
      this.config.moderation.enabled &&
        account &&
        this.operatorAccounts.has(String(account)),
    );
  }

  async getCommunityPosts(options) {
    if (!this.config.moderation.enabled) return this.hiveReads.getCommunityPosts(options);
    const policy = this.#policy();
    return this.hiveReads.getCommunityPosts({
      ...options,
      contentFilter: (item) => !policy.isHidden(item),
      scanPageLimit: this.scanPageLimit,
    });
  }

  async getLatestThreads(account) {
    if (!this.config.moderation.enabled) return this.hiveReads.getLatestThreads(account);
    const policy = this.#policy();
    return this.hiveReads.getLatestThreads(account, {
      discussionFilter: (discussion) =>
        filterDiscussionBranches(discussion, policy, { protectRoot: true }),
    });
  }

  async getPostWithComments(author, permlink) {
    if (!this.config.moderation.enabled) {
      return this.hiveReads.getPostWithComments(author, permlink);
    }
    return this.hiveReads.getPostWithComments(author, permlink, {
      discussionFilter: (discussion) => {
        if (!isCommunityRoot(discussion.post, this.config.hive.communityId)) return discussion;
        const policy = this.#policy();
        if (policy.isHidden(discussion.post)) {
          throw new NotFoundError('Post not found');
        }
        return filterDiscussionBranches(discussion, policy);
      },
    });
  }

  managementData() {
    const store = this.#store();
    return {
      activeTargets: store.listActive(),
      history: store.history(50),
    };
  }

  hide(input) {
    return this.#store().hide(input);
  }

  unhide(input) {
    return this.#store().unhide(input);
  }

  #policy() {
    return createModerationPolicy(this.#store().snapshot());
  }

  #store() {
    if (!this.config.moderation.enabled) {
      throw new FeatureUnavailableError('Merchant-local moderation is not enabled.', {
        code: 'MODERATION_DISABLED',
      });
    }
    if (!this.store) {
      throw new FeatureUnavailableError(
        'Community moderation is temporarily unavailable. Hidden-content policy was not bypassed.',
        { code: 'MODERATION_STORE_UNAVAILABLE', cause: this.unavailableCause },
      );
    }
    return this.store;
  }
}

module.exports = { ModerationService };
