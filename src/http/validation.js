'use strict';

const { COMMUNITY_PATTERN, HIVE_ACCOUNT_PATTERN } = require('../config');
const { ValidationError } = require('../lib/errors');

const PERMLINK_PATTERN = /^[a-z0-9][a-z0-9-]{0,255}$/;
const COMMUNITY_SORTS = new Set(['trending', 'hot', 'created', 'promoted', 'payout', 'muted']);

function requireHiveAccount(value, label = 'Hive account') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!HIVE_ACCOUNT_PATTERN.test(normalized)) throw new ValidationError(`${label} is invalid`);
  return normalized;
}

function requireCommunityId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!COMMUNITY_PATTERN.test(normalized)) throw new ValidationError('Community id is invalid');
  return normalized;
}

function requireConfiguredCommunity(value, config) {
  const community = requireCommunityId(value);
  if (community !== config.hive.communityId) {
    throw new ValidationError('This deployment serves only its configured community');
  }
  return community;
}

function requirePermlink(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!PERMLINK_PATTERN.test(normalized)) throw new ValidationError('Permlink is invalid');
  return normalized;
}

function requireCommunitySort(value) {
  const normalized = String(value || 'trending').trim().toLowerCase();
  if (!COMMUNITY_SORTS.has(normalized)) throw new ValidationError('Community sort is invalid');
  return normalized;
}

module.exports = {
  requireCommunitySort,
  requireConfiguredCommunity,
  requireHiveAccount,
  requirePermlink,
};
