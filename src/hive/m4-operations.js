'use strict';

const { requireHiveAccount } = require('../http/validation');
const { ConflictError, ValidationError } = require('../lib/errors');
const { parseAsset } = require('./assets');
const { buildInboxMemo, buildWallMemo, exclusionSet } = require('./messages');
const { prepareProfileUpdate } = require('./profile-settings');
const { fingerprint } = require('./social-operations');

const M4_ACTIONS = new Set(['profile', 'claim-rewards', 'wall', 'inbox']);

function operationEnvelope(action, account, authority, operations, summary) {
  return Object.freeze({
    action,
    account,
    authority,
    operations,
    fingerprint: fingerprint(operations),
    summary: Object.freeze(summary),
  });
}

function buildProfileUpdate({ account: accountValue, payload, rawMetadata, config }) {
  const account = requireHiveAccount(accountValue);
  const prepared = prepareProfileUpdate({
    rawMetadata,
    baseRevision: payload?.baseRevision,
    payload,
    defaultWallFee: config.hive.defaultWallFee,
  });
  const operation = [
    'account_update2',
    {
      account,
      json_metadata: '',
      posting_json_metadata: prepared.postingJsonMetadata,
      extensions: [],
    },
  ];
  return operationEnvelope('profile', account, 'Posting', [operation], {
    kind: 'Profile settings update',
    account,
    exactDiff: prepared.diff,
    proposedRevision: prepared.proposedRevision,
  });
}

function canonicalReward(value, symbol, zeroValue) {
  const parsed = parseAsset(value ?? zeroValue, symbol);
  if (!parsed) throw new ValidationError(`Current ${symbol} reward balance is invalid`);
  return parsed;
}

function buildClaimRewards({ account: accountValue, accountRecord }) {
  const account = requireHiveAccount(accountValue);
  if (!accountRecord || accountRecord.name !== account) {
    throw new ValidationError('Current reward balances are unavailable for this account');
  }
  const rewardHive = canonicalReward(accountRecord.reward_hive_balance, 'HIVE', '0.000 HIVE');
  const rewardHbd = canonicalReward(accountRecord.reward_hbd_balance, 'HBD', '0.000 HBD');
  const rewardVests = canonicalReward(
    accountRecord.reward_vesting_balance,
    'VESTS',
    '0.000000 VESTS',
  );
  if (rewardHive.units === 0n && rewardHbd.units === 0n && rewardVests.units === 0n) {
    throw new ConflictError('There are no non-zero reward balances to claim', {
      code: 'NO_CLAIMABLE_REWARDS',
    });
  }
  const operation = [
    'claim_reward_balance',
    {
      account,
      reward_hive: rewardHive.canonical,
      reward_hbd: rewardHbd.canonical,
      reward_vests: rewardVests.canonical,
    },
  ];
  return operationEnvelope('claim-rewards', account, 'Posting', [operation], {
    kind: 'Claim current rewards',
    account,
    rewardHive: rewardHive.canonical,
    rewardHbd: rewardHbd.canonical,
    rewardVests: rewardVests.canonical,
  });
}

function requireCurrentFee(payload, recipientSettings) {
  const current = parseAsset(recipientSettings?.wallFee, 'HBD');
  const expected = parseAsset(String(payload?.expectedFee || '').trim(), 'HBD');
  if (!current || current.units <= 0n) throw new ValidationError('Recipient wall fee is invalid');
  if (!expected || expected.canonical !== current.canonical) {
    throw new ConflictError(
      `The recipient's current message fee is ${current.canonical}; review it before signing`,
      { code: 'WALL_FEE_CHANGED' },
    );
  }
  const amount = payload?.amount
    ? parseAsset(String(payload.amount).trim(), 'HBD')
    : current;
  if (!amount || amount.units < current.units) {
    throw new ValidationError(`Transfer amount must be at least ${current.canonical}`);
  }
  return { amount, current };
}

function requireSenderAllowed(account, recipientSettings, config) {
  const excluded = exclusionSet(
    config.hive.globalWallExclusions,
    recipientSettings?.blocklist,
  );
  if (excluded.has(account)) {
    throw new ConflictError('This sender is excluded from the recipient message display', {
      code: 'WALL_SENDER_EXCLUDED',
    });
  }
}

function buildMessageTransfer({ action, account: accountValue, payload, recipientSettings, config }) {
  const account = requireHiveAccount(accountValue);
  const recipient = requireHiveAccount(payload?.recipient, 'Message recipient');
  requireSenderAllowed(account, recipientSettings, config);
  const { amount, current } = requireCurrentFee(payload, recipientSettings);
  const memo = action === 'wall' ? buildWallMemo(payload?.message) : buildInboxMemo(payload?.ciphertext);
  const operation = [
    'transfer',
    {
      from: account,
      to: recipient,
      amount: amount.canonical,
      memo,
    },
  ];
  return operationEnvelope(action, account, 'Active', [operation], {
    kind: action === 'wall' ? 'Permanent public wall message' : 'Encrypted inbox message',
    sender: account,
    recipient,
    amount: amount.canonical,
    minimumFee: current.canonical,
    visibility:
      action === 'wall'
        ? 'Public memo text; permanent on Hive'
        : 'Encrypted memo content; sender, recipient, amount, time, and transaction remain public',
    memo:
      action === 'wall'
        ? memo
        : `Marked Keychain ciphertext (${Buffer.byteLength(memo, 'utf8').toLocaleString('en-US')} UTF-8 bytes)`,
  });
}

function buildM4Operation(action, options) {
  if (!M4_ACTIONS.has(action)) throw new ValidationError('M4 action is invalid');
  if (action === 'profile') return buildProfileUpdate(options);
  if (action === 'claim-rewards') return buildClaimRewards(options);
  return buildMessageTransfer({ ...options, action });
}

module.exports = {
  M4_ACTIONS,
  buildClaimRewards,
  buildM4Operation,
  buildMessageTransfer,
  buildProfileUpdate,
  requireCurrentFee,
};
