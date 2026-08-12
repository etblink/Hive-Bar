'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildInboxMemo,
  buildWallMemo,
  createMessagePage,
  encodeHistoryCursor,
  parseHistoryCursor,
} = require('../src/hive/messages');
const { fixture } = require('./support/fixture-rpc');

test('builds bounded versioned wall and inbox memo markers', () => {
  assert.equal(buildWallMemo('Hello'), 'hivebar-wall:v1:Hello');
  assert.equal(buildInboxMemo('#8ciphertext'), 'hivebar-inbox:v1:#8ciphertext');
  assert.throws(() => buildWallMemo(''), /required/);
  assert.throws(() => buildInboxMemo('plaintext'), /ciphertext is invalid/);
  assert.throws(() => buildWallMemo('x'.repeat(2048)), /fewer than 2048/);
});

test('classifies only qualifying inbound marked HBD wall transfers', () => {
  const page = createMessagePage(fixture.accountHistory.etblink, {
    account: 'etblink',
    minimumFee: '1.000 HBD',
    globalExclusions: ['rewardbot'],
    profileExclusions: ['spammer'],
    kind: 'wall',
    pageSize: 6,
  });
  assert.equal(page.items.length, 1);
  assert.deepEqual(page.items[0], {
    sender: 'barfriend',
    recipient: 'etblink',
    amount: '1.000 HBD',
    message: 'Welcome to the neighborhood.',
    timestamp: '2026-08-11T21:00:00',
    transactionId: '1'.repeat(40),
    blockNumber: 108944500,
    historyIndex: 20,
  });
  assert.ok(page.nextCursor);
});

test('classifies only marked ciphertext for the verified inbox data page', () => {
  const page = createMessagePage(fixture.accountHistory.etblink, {
    account: 'etblink',
    minimumFee: '1.000 HBD',
    globalExclusions: [],
    profileExclusions: [],
    kind: 'inbox',
    pageSize: 25,
  });
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].ciphertext, '#8fixtureciphertext');
  assert.equal(page.items[0].sender, 'barfriend');
});

test('round-trips bounded message-history cursors and rejects tampering', () => {
  const cursor = encodeHistoryCursor(14);
  assert.equal(parseHistoryCursor(cursor), 14);
  assert.equal(parseHistoryCursor(''), null);
  assert.throws(() => parseHistoryCursor('not+base64'), /cursor is invalid/);
  assert.throws(
    () => parseHistoryCursor(Buffer.from('{"before":-1}').toString('base64url')),
    /cursor is invalid/,
  );
});
