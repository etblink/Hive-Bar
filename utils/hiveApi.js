'use strict';

const hiveClient = require('./hiveClient');

async function getFollowers(account, start = '', limit = 100) {
  const followers = await hiveClient.call('condenser_api', 'get_followers', [
    account,
    start,
    'blog',
    Math.min(limit, 100),
  ]);
  return followers.map((follower) => ({
    name: follower.follower,
    avatar: `https://images.hive.blog/u/${follower.follower}/avatar/small`,
  }));
}

async function getFollowing(account, start = '', limit = 100) {
  const following = await hiveClient.call('condenser_api', 'get_following', [
    account,
    start,
    'blog',
    Math.min(limit, 100),
  ]);
  return following.map((follow) => ({
    name: follow.following,
    avatar: `https://images.hive.blog/u/${follow.following}/avatar/small`,
  }));
}

async function getAccountHistory(account, start = -1, limit = 200, filter = null) {
  const history = await hiveClient.call('condenser_api', 'get_account_history', [
    account,
    start,
    Math.min(limit, 1000),
  ]);
  return filter ? history.filter((transaction) => transaction[1].op[0] === filter) : history;
}

function getAccounts(accounts) {
  return hiveClient.call('condenser_api', 'get_accounts', [accounts]);
}

function getDynamicGlobalProperties() {
  return hiveClient.call('condenser_api', 'get_dynamic_global_properties', []);
}

async function getResourceCredits(username, nowSeconds = Math.floor(Date.now() / 1000)) {
  const result = await hiveClient.call('rc_api', 'find_rc_accounts', { accounts: [username] });
  const account = result?.rc_accounts?.[0];
  if (!account) return '0.00';

  const maxRc = Number(account.max_rc);
  const storedMana = Number(account.rc_manabar.current_mana);
  const lastUpdate = Number(account.rc_manabar.last_update_time);
  if (!(maxRc > 0) || !Number.isFinite(storedMana) || !Number.isFinite(lastUpdate)) return '0.00';

  const regenerated = (Math.max(0, nowSeconds - lastUpdate) * maxRc) / 432000;
  const currentMana = Math.min(maxRc, storedMana + regenerated);
  return ((currentMana / maxRc) * 100).toFixed(2);
}

async function getVotingPower(account, nowMs = Date.now()) {
  const storedPower = Number(account.voting_power);
  const lastVoteMs = Date.parse(`${account.last_vote_time}Z`);
  if (!Number.isFinite(storedPower) || !Number.isFinite(lastVoteMs)) return '0.00';

  const elapsedSeconds = Math.max(0, nowMs - lastVoteMs) / 1000;
  const regenerated = (elapsedSeconds * 10000) / 432000;
  return (Math.min(storedPower + regenerated, 10000) / 100).toFixed(2);
}

async function getFollowStatus(follower, following) {
  const result = await hiveClient.call('condenser_api', 'get_following', [
    follower,
    following,
    'blog',
    1,
  ]);
  return result.length > 0 && result[0].following === following;
}

async function checkCommunityMembership(username, community) {
  const result = await hiveClient.call('bridge', 'get_community', {
    name: community,
    observer: username,
  });
  return Boolean(result?.context?.subscribed);
}

module.exports = {
  checkCommunityMembership,
  getAccountHistory,
  getAccounts,
  getDynamicGlobalProperties,
  getFollowers,
  getFollowing,
  getFollowStatus,
  getResourceCredits,
  getVotingPower,
};
