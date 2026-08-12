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

function requirePageCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  const encoded = String(value).trim();
  if (encoded.length > 512 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new ValidationError('Pagination cursor is invalid');
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Pagination cursor is invalid');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('Pagination cursor is invalid');
  }

  return {
    author: requireHiveAccount(parsed.author, 'Pagination author'),
    permlink: requirePermlink(parsed.permlink),
  };
}

function requireConnectionCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  const encoded = String(value).trim();
  if (encoded.length > 256 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new ValidationError('Connection pagination cursor is invalid');
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Connection pagination cursor is invalid');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('Connection pagination cursor is invalid');
  }

  try {
    return { account: requireHiveAccount(parsed.account, 'Connection pagination account') };
  } catch {
    throw new ValidationError('Connection pagination cursor is invalid');
  }
}

module.exports = {
  requireConnectionCursor,
  requireCommunitySort,
  requireConfiguredCommunity,
  requireHiveAccount,
  requirePageCursor,
  requirePermlink,
};
