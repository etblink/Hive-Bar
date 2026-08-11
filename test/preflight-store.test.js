'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PreflightStore } = require('../src/social/preflight-store');

const envelope = Object.freeze({
  account: 'etblink',
  action: 'vote',
  authority: 'Posting',
  operations: [['vote', { voter: 'etblink', author: 'barfriend', permlink: 'hello', weight: 5000 }]],
  fingerprint: 'a'.repeat(64),
  summary: { kind: 'Vote', percent: 50 },
});

test('rejects duplicate preparations until cancellation releases the fingerprint', () => {
  let id = 0;
  const store = new PreflightStore({ ttlMs: 300_000, random: () => `preflight-${++id}` });
  const first = store.create({ sessionId: 'session-1', envelope });
  assert.equal(first.state, 'prepared');
  assert.throws(
    () => store.create({ sessionId: 'session-1', envelope }),
    (error) => error.code === 'DUPLICATE_OPERATION',
  );

  store.cancel(first.id, 'session-1');
  const retry = store.create({ sessionId: 'session-1', envelope });
  assert.equal(retry.id, 'preflight-2');
});

test('binds preflights to a session and records acceptance before observation', () => {
  const store = new PreflightStore({ ttlMs: 300_000, random: () => 'preflight-1' });
  const created = store.create({ sessionId: 'session-1', envelope });
  assert.throws(
    () => store.get(created.id, 'session-2'),
    (error) => error.code === 'PREFLIGHT_SESSION_MISMATCH',
  );
  assert.throws(
    () => store.markObserved(created.id, 'session-1', true),
    (error) => error.code === 'BROADCAST_ACCEPTANCE_REQUIRED',
  );

  const accepted = store.markAccepted(created.id, 'session-1', 'b'.repeat(40));
  assert.equal(accepted.state, 'broadcast_accepted');
  assert.equal(accepted.transactionId, 'b'.repeat(40));
  assert.throws(
    () => store.cancel(created.id, 'session-1'),
    (error) => error.code === 'PREFLIGHT_NOT_CANCELLABLE',
  );
  assert.throws(
    () => store.markAccepted(created.id, 'session-1', 'c'.repeat(40)),
    (error) => error.code === 'TRANSACTION_ID_CONFLICT',
  );

  const pending = store.markObserved(created.id, 'session-1', false);
  assert.equal(pending.state, 'broadcast_accepted');
  assert.equal(pending.observationChecks, 1);
  const observed = store.markObserved(created.id, 'session-1', true);
  assert.equal(observed.state, 'observed');
  assert.equal(observed.observationChecks, 2);
  assert.ok(observed.observedAt);
});

test('expires preflights and releases their duplicate keys', () => {
  let now = 1_000;
  let id = 0;
  const store = new PreflightStore({
    ttlMs: 30_000,
    now: () => now,
    random: () => `preflight-${++id}`,
  });
  const first = store.create({ sessionId: 'session-1', envelope });
  now += 30_001;
  assert.throws(() => store.get(first.id, 'session-1'), /not found or has expired/);
  assert.equal(store.create({ sessionId: 'session-1', envelope }).id, 'preflight-2');
});
