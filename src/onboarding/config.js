'use strict';

const { ValidationError } = require('../lib/errors');
const { requireHiveAccount } = require('../http/validation');

const CASH_FEE_USD = '5.00';

function parseBoolean(value, label) {
  const normalized = String(value ?? 'false').trim().toLowerCase();
  if (['true', '1'].includes(normalized)) return true;
  if (['false', '0', ''].includes(normalized)) return false;
  throw new ValidationError(`${label} must be true or false`);
}

function parseStarterHp(value) {
  const raw = String(value ?? '5.000').trim();
  const match = /^(0|[1-9][0-9]{0,5})\.([0-9]{3})$/.exec(raw);
  if (!match) throw new ValidationError('Onboarding starter HP must use exactly three decimals');
  const units = BigInt(`${match[1]}${match[2]}`);
  if (units <= 0n) throw new ValidationError('Onboarding starter HP must be positive');
  return Object.freeze({ units, display: `${match[1]}.${match[2]} HP` });
}

function parseTtl(value) {
  const parsed = Number(value ?? 900000);
  if (!Number.isSafeInteger(parsed) || parsed < 300000 || parsed > 3600000) {
    throw new ValidationError('Onboarding request TTL must be between 5 and 60 minutes');
  }
  return parsed;
}

function parseOnboardingConfig(source, hiveConfig) {
  const enabled = parseBoolean(source.HIVE_ONBOARDING_ENABLED, 'HIVE_ONBOARDING_ENABLED');
  const creatorRaw = String(source.HIVE_ONBOARDING_CREATOR_ACCOUNT || '').trim().toLowerCase();
  const creator = creatorRaw ? requireHiveAccount(creatorRaw, 'Onboarding creator account') : '';
  if (enabled && !creator) {
    throw new ValidationError('Onboarding requires an explicit creator account');
  }
  const starterHp = parseStarterHp(source.HIVE_ONBOARDING_STARTER_HP);
  const ttlMs = parseTtl(source.HIVE_ONBOARDING_REQUEST_TTL_MS);
  const active = enabled && hiveConfig.writeMode === 'beta' && hiveConfig.signerMode === 'keychain';
  return Object.freeze({
    enabled,
    active,
    creator,
    starterHp,
    requestTtlMs: ttlMs,
    cashFeeUsd: CASH_FEE_USD,
  });
}

module.exports = { CASH_FEE_USD, parseOnboardingConfig, parseStarterHp };
