'use strict';

const { createHash } = require('node:crypto');
const { canonicalFromUnits, parseAsset } = require('../hive/assets');
const { ValidationError } = require('../lib/errors');

function ceilDivide(numerator, denominator) {
  if (denominator <= 0n) throw new ValidationError('Hive vesting conversion is unavailable');
  return (numerator + denominator - 1n) / denominator;
}

function hpToVests(starterHpUnits, globalProperties) {
  const totalFund = parseAsset(globalProperties?.total_vesting_fund_hive, 'HIVE');
  const totalVests = parseAsset(globalProperties?.total_vesting_shares, 'VESTS');
  if (!totalFund || !totalVests || totalFund.units <= 0n || totalVests.units <= 0n) {
    throw new ValidationError('Hive vesting conversion data is invalid');
  }
  const vestUnits = ceilDivide(starterHpUnits * totalVests.units, totalFund.units);
  return Object.freeze({ units: vestUnits, canonical: canonicalFromUnits(vestUnits, 6, 'VESTS') });
}

function availableVests(account) {
  const vesting = parseAsset(account?.vesting_shares, 'VESTS');
  const delegated = parseAsset(account?.delegated_vesting_shares, 'VESTS');
  if (!vesting || !delegated) throw new ValidationError('Creator Hive Power data is invalid');
  let remainingWithdrawal = 0n;
  try {
    const toWithdraw = BigInt(String(account?.to_withdraw ?? '0'));
    const withdrawn = BigInt(String(account?.withdrawn ?? '0'));
    remainingWithdrawal = toWithdraw > withdrawn ? toWithdraw - withdrawn : 0n;
  } catch {
    throw new ValidationError('Creator power-down data is invalid');
  }
  const available = vesting.units - delegated.units - remainingWithdrawal;
  return available > 0n ? available : 0n;
}

function authority(publicKey) {
  return {
    weight_threshold: 1,
    account_auths: [],
    key_auths: [[publicKey, 1]],
  };
}

function buildOnboardingOperations({ creator, username, publicKeys, delegationVests }) {
  const operations = [
    [
      'create_claimed_account',
      {
        creator,
        new_account_name: username,
        owner: authority(publicKeys.owner),
        active: authority(publicKeys.active),
        posting: authority(publicKeys.posting),
        memo_key: publicKeys.memo,
        json_metadata: '',
        extensions: [],
      },
    ],
    [
      'delegate_vesting_shares',
      {
        delegator: creator,
        delegatee: username,
        vesting_shares: delegationVests.canonical,
      },
    ],
  ];
  const fingerprint = createHash('sha256').update(JSON.stringify(operations), 'utf8').digest('hex');
  return Object.freeze({ operations, fingerprint, authority: 'Active' });
}

function authorityMatches(actual, expectedKey) {
  return Boolean(
    actual &&
      Number(actual.weight_threshold) === 1 &&
      Array.isArray(actual.account_auths) &&
      actual.account_auths.length === 0 &&
      Array.isArray(actual.key_auths) &&
      actual.key_auths.length === 1 &&
      actual.key_auths[0]?.[0] === expectedKey &&
      Number(actual.key_auths[0]?.[1]) === 1,
  );
}

function accountKeysMatch(account, publicKeys) {
  return Boolean(
    account &&
      authorityMatches(account.owner, publicKeys.owner) &&
      authorityMatches(account.active, publicKeys.active) &&
      authorityMatches(account.posting, publicKeys.posting) &&
      account.memo_key === publicKeys.memo,
  );
}

module.exports = {
  accountKeysMatch,
  availableVests,
  buildOnboardingOperations,
  ceilDivide,
  hpToVests,
};
