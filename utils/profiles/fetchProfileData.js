'use strict';

const { plainTextExcerpt, renderMarkdown } = require('../../src/content/markdown');
const hiveClient = require('../hiveClient');

function safeJsonObject(value) {
  if (typeof value !== 'string' || value.trim() === '') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function safeImageUrl(value, fallback) {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function normalizeProfile(account, followCount) {
  const legacyMetadata = safeJsonObject(account.json_metadata);
  const postingMetadata = safeJsonObject(account.posting_json_metadata);
  const profile = {
    ...(legacyMetadata.profile && typeof legacyMetadata.profile === 'object' ? legacyMetadata.profile : {}),
    ...(postingMetadata.profile && typeof postingMetadata.profile === 'object' ? postingMetadata.profile : {}),
  };
  const fallbackImage = `https://images.hive.blog/u/${account.name}/avatar`;

  return {
    ...account,
    follower_count: Number(followCount?.follower_count || 0),
    following_count: Number(followCount?.following_count || 0),
    json_metadata: account.json_metadata || '{}',
    posting_json_metadata: account.posting_json_metadata || '{}',
    profile: {
      name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : account.name,
      about: typeof profile.about === 'string' ? profile.about.trim() : '',
      profileImage: safeImageUrl(profile.profile_image, fallbackImage),
      wallPostFee: typeof profile.wall_post_fee === 'string' ? profile.wall_post_fee : null,
    },
  };
}

async function fetchUserProfile(username) {
  const [accounts, followCount] = await Promise.all([
    hiveClient.call('condenser_api', 'get_accounts', [[username]]),
    hiveClient.call('condenser_api', 'get_follow_count', [username]),
  ]);
  return accounts[0] ? normalizeProfile(accounts[0], followCount) : null;
}

async function fetchUserPosts(username, limit = 20) {
  const posts = await hiveClient.call('condenser_api', 'get_discussions_by_blog', [
    { tag: username, limit },
  ]);

  return Promise.all(
    posts.map(async (post) => {
      const activeVotes = await hiveClient.call('condenser_api', 'get_active_votes', [
        post.author,
        post.permlink,
      ]);
      const pending = Number.parseFloat(post.pending_payout_value) || 0;
      const authorPaid = Number.parseFloat(post.total_payout_value) || 0;
      const curatorPaid = Number.parseFloat(post.curator_payout_value) || 0;
      const maximum = Number.parseFloat(post.max_accepted_payout);
      const total = pending + authorPaid + curatorPaid;
      const estimated = Number.isFinite(maximum) ? Math.min(total, maximum) : total;

      return {
        ...post,
        likes: activeVotes.filter((vote) => Number(vote.percent) > 0).length,
        estimated_payout: estimated.toFixed(2),
        parsedBody: renderMarkdown(post.body),
        excerpt: plainTextExcerpt(post.body),
      };
    }),
  );
}

module.exports = {
  fetchUserPosts,
  fetchUserProfile,
  normalizeProfile,
  safeJsonObject,
};
