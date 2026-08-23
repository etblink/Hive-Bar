'use strict';

const path = require('node:path');
const { ValidationError } = require('../lib/errors');
const { requireHiveAccount } = require('../http/validation');

const DEFAULT_CASH_FEE_USD = '5.00';
const DEFAULT_ONBOARDING_DB_PATH = '/var/lib/hive-bar/onboarding/onboarding.sqlite3';
const MIN_ONBOARDING_REMAINING_HP = '10.000';
const MIN_ONBOARDING_REMAINING_HP_UNITS = 10000n;
const DEFAULT_LOW_ACT_THRESHOLD = 3;

function parseBoolean(value, label) {
  const normalized = String(value ?? 'false').trim().toLowerCase();
  if (['true', '1'].includes(normalized)) return true;
  if (['false', '0', ''].includes(normalized)) return false;
  throw new ValidationError(`${label} must be true or false`);
}

function parseHp(value, fallback, label, { minimumUnits = 1n } = {}) {
  const raw = String(value ?? fallback).trim();
  const match = /^(0|[1-9][0-9]{0,5})\.([0-9]{3})$/.exec(raw);
  if (!match) throw new ValidationError(`${label} must use exactly three decimals`);
  const units = BigInt(`${match[1]}${match[2]}`);
  if (units < minimumUnits) {
    throw new ValidationError(`${label} must be at least ${MIN_ONBOARDING_REMAINING_HP}`);
  }
  return Object.freeze({ units, display: `${match[1]}.${match[2]} HP`, canonical: raw });
}

function parseStarterHp(value) {
  const raw = String(value ?? '5.000').trim();
  const match = /^(0|[1-9][0-9]{0,5})\.([0-9]{3})$/.exec(raw);
  if (!match) throw new ValidationError('Onboarding starter HP must use exactly three decimals');
  const units = BigInt(`${match[1]}${match[2]}`);
  if (units <= 0n) throw new ValidationError('Onboarding starter HP must be positive');
  return Object.freeze({ units, display: `${match[1]}.${match[2]} HP`, canonical: raw });
}

function parseMinimumRemainingHp(value) {
  return parseHp(
    value,
    MIN_ONBOARDING_REMAINING_HP,
    'Onboarding minimum remaining HP',
    { minimumUnits: MIN_ONBOARDING_REMAINING_HP_UNITS },
  );
}

function parseCashFeeUsd(value) {
  const raw = String(value ?? DEFAULT_CASH_FEE_USD).trim();
  const match = /^(0|[1-9][0-9]{0,5})\.([0-9]{2})$/.exec(raw);
  if (!match) throw new ValidationError('Onboarding cash fee USD must use exactly two decimals');
  const cents = BigInt(`${match[1]}${match[2]}`);
  if (cents <= 0n) throw new ValidationError('Onboarding cash fee USD must be positive');
  return raw;
}

function parseTtl(value) {
  const parsed = Number(value ?? 900000);
  if (!Number.isSafeInteger(parsed) || parsed < 300000 || parsed > 3600000) {
    throw new ValidationError('Onboarding request TTL must be between 5 and 60 minutes');
  }
  return parsed;
}

function parseInteger(value, fallback, label, { min, max }) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseDatabasePath(value) {
  const normalized = String(value ?? DEFAULT_ONBOARDING_DB_PATH).trim();
  if (
    !normalized ||
    normalized.includes('\0') ||
    Buffer.byteLength(normalized, 'utf8') > 1024 ||
    (normalized !== ':memory:' && !path.isAbsolute(normalized))
  ) {
    throw new ValidationError('Onboarding database path must be an absolute SQLite file path or :memory:');
  }
  return normalized;
}

function parseOnboardingConfig(source, hiveConfig) {
  const enabled = parseBoolean(source.HIVE_ONBOARDING_ENABLED, 'HIVE_ONBOARDING_ENABLED');
  const creatorRaw = String(source.HIVE_ONBOARDING_CREATOR_ACCOUNT || '').trim().toLowerCase();
  const creator = creatorRaw ? requireHiveAccount(creatorRaw, 'Onboarding creator account') : '';
  if (enabled && !creator) {
    throw new ValidationError('Onboarding requires an explicit creator account');
  }

  const cashFeeUsd = parseCashFeeUsd(source.HIVE_ONBOARDING_CASH_FEE_USD);
  const starterHp = parseStarterHp(source.HIVE_ONBOARDING_STARTER_HP);
  const minRemainingHp = parseMinimumRemainingHp(source.HIVE_ONBOARDING_MIN_REMAINING_HP);
  const lowActThreshold = parseInteger(
    source.HIVE_ONBOARDING_LOW_ACT_THRESHOLD,
    DEFAULT_LOW_ACT_THRESHOLD,
    'Onboarding low-ACT warning threshold',
    { min: 1, max: 1000 },
  );
  const ttlMs = parseTtl(source.HIVE_ONBOARDING_REQUEST_TTL_MS);
  const dbPath = parseDatabasePath(source.HIVE_ONBOARDING_DB_PATH);
  if (enabled && String(source.NODE_ENV || '').trim() !== 'test' && dbPath === ':memory:') {
    throw new ValidationError('Enabled onboarding requires an explicit durable database path');
  }

  const requestRateWindowMs = parseInteger(
    source.HIVE_ONBOARDING_REQUEST_RATE_WINDOW_MS,
    60000,
    'Onboarding request rate window',
    { min: 1000, max: 3600000 },
  );
  const requestRateMax = parseInteger(
    source.HIVE_ONBOARDING_REQUEST_RATE_MAX,
    5,
    'Onboarding request rate maximum',
    { min: 1, max: 10000 },
  );
  const maxLiveRequests = parseInteger(
    source.HIVE_ONBOARDING_MAX_LIVE_REQUESTS,
    25,
    'Onboarding live-request maximum',
    { min: 1, max: 100000 },
  );
  const maxDailyRequests = parseInteger(
    source.HIVE_ONBOARDING_MAX_DAILY_REQUESTS,
    50,
    'Onboarding daily-request maximum',
    { min: 1, max: 1000000 },
  );
  if (maxDailyRequests < maxLiveRequests) {
    throw new ValidationError('Onboarding daily-request maximum must be at least the live-request maximum');
  }

  const active = enabled && hiveConfig.writeMode === 'beta' && hiveConfig.signerMode === 'keychain';
  return Object.freeze({
    enabled,
    active,
    creator,
    cashFeeUsd,
    starterHp,
    minRemainingHp,
    lowActThreshold,
    requestTtlMs: ttlMs,
    dbPath,
    requestRateWindowMs,
    requestRateMax,
    maxLiveRequests,
    maxDailyRequests,
  });
}

module.exports = {
  DEFAULT_CASH_FEE_USD,
  DEFAULT_LOW_ACT_THRESHOLD,
  DEFAULT_ONBOARDING_DB_PATH,
  MIN_ONBOARDING_REMAINING_HP,
  MIN_ONBOARDING_REMAINING_HP_UNITS,
  parseCashFeeUsd,
  parseDatabasePath,
  parseMinimumRemainingHp,
  parseOnboardingConfig,
  parseStarterHp,
};
