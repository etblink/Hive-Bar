'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildClaimRewards,
  buildMessageTransfer,
  buildProfileUpdate,
} = require('../src/hive/m4-operations');
const { metadataRevision } = require('../src/hive/profile-settings');

const config = {
  hive: {
    defaultWallFee: '1.000 HBD',
    globalWallExclusions: ['rewardbot'],
  },
};

test('builds the exact Posting-authority account_update2 vector and inspectable diff', () => {
  const rawMetadata = JSON.stringify({ profile: { name: 'Old', location: 'Reno' }, foreign: true });
  const envelope = buildProfileUpdate({
    account: 'etblink',
    rawMetadata,
    config,
    payload: {
      baseRevision: metadataRevision(rawMetadata),
      displayName: 'Evan',
      about: 'About',
      profileImage: 'https://images.hive.blog/u/etblink/avatar',
      wallFee: '1.000 HBD',
      blocklist: 'spammer',
    },
  });
  assert.equal(envelope.authority, 'Posting');
  assert.equal(envelope.action, 'profile');
  assert.deepEqual(envelope.operations[0][0], 'account_update2');
  assert.equal(envelope.operations[0][1].json_metadata, '');
  assert.deepEqual(envelope.operations[0][1].extensions, []);
  const merged = JSON.parse(envelope.operations[0][1].posting_json_metadata);
  assert.equal(merged.profile.location, 'Reno');
  assert.equal(merged.foreign, true);
  assert.deepEqual(merged.hivebar.wall_blocklist, ['spammer']);
  assert.ok(envelope.summary.exactDiff.displayName);
});

test('builds an exact current-balance claim and blocks a zero claim', () => {
  const envelope = buildClaimRewards({
    account: 'etblink',
    accountRecord: {
      name: 'etblink',
      reward_hive_balance: '1.000 HIVE',
      reward_hbd_balance: '0.500 HBD',
      reward_vesting_balance: '1000.000000 VESTS',
    },
  });
  assert.equal(envelope.authority, 'Posting');
  assert.deepEqual(envelope.operations, [[
    'claim_reward_balance',
    {
      account: 'etblink',
      reward_hive: '1.000 HIVE',
      reward_hbd: '0.500 HBD',
      reward_vests: '1000.000000 VESTS',
    },
  ]]);
  assert.throws(
    () => buildClaimRewards({
      account: 'etblink',
      accountRecord: {
        name: 'etblink',
        reward_hive_balance: '0.000 HIVE',
        reward_hbd_balance: '0.000 HBD',
        reward_vesting_balance: '0.000000 VESTS',
      },
    }),
    (error) => error.code === 'NO_CLAIMABLE_REWARDS',
  );
});

test('builds exact Active wall and ciphertext transfers after current-fee validation', () => {
  const recipientSettings = { wallFee: '1.000 HBD', blocklist: [] };
  const wall = buildMessageTransfer({
    action: 'wall',
    account: 'barfriend',
    recipientSettings,
    config,
    payload: {
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.500 HBD',
      message: 'Hello',
    },
  });
  assert.equal(wall.authority, 'Active');
  assert.deepEqual(wall.operations, [[
    'transfer',
    { from: 'barfriend', to: 'etblink', amount: '1.500 HBD', memo: 'hivebar-wall:v1:Hello' },
  ]]);

  const inbox = buildMessageTransfer({
    action: 'inbox',
    account: 'barfriend',
    recipientSettings,
    config,
    payload: {
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      ciphertext: '#8ciphertext',
    },
  });
  assert.equal(inbox.operations[0][1].memo, 'hivebar-inbox:v1:#8ciphertext');
  assert.doesNotMatch(JSON.stringify(inbox.summary), /#8ciphertext/);
});

test('blocks stale fees, below-fee amounts, and both exclusion layers', () => {
  const base = {
    action: 'wall',
    account: 'barfriend',
    config,
    recipientSettings: { wallFee: '2.000 HBD', blocklist: [] },
    payload: { recipient: 'etblink', expectedFee: '1.000 HBD', message: 'Hello' },
  };
  assert.throws(() => buildMessageTransfer(base), (error) => error.code === 'WALL_FEE_CHANGED');
  assert.throws(
    () => buildMessageTransfer({
      ...base,
      payload: { ...base.payload, expectedFee: '2.000 HBD', amount: '1.999 HBD' },
    }),
    /at least 2\.000 HBD/,
  );
  assert.throws(
    () => buildMessageTransfer({
      ...base,
      account: 'rewardbot',
      payload: { ...base.payload, expectedFee: '2.000 HBD' },
    }),
    (error) => error.code === 'WALL_SENDER_EXCLUDED',
  );
  assert.throws(
    () => buildMessageTransfer({
      ...base,
      recipientSettings: { wallFee: '2.000 HBD', blocklist: ['barfriend'] },
      payload: { ...base.payload, expectedFee: '2.000 HBD' },
    }),
    (error) => error.code === 'WALL_SENDER_EXCLUDED',
  );
});
