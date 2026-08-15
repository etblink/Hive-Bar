'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, logger } = require('./support/test-app');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'm9-fixture-session-secret-that-is-at-least-32-bytes';
const ACCOUNT = 'fourthstreetbar';

function rehearsalApp() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: ACCOUNT,
    HIVE_CONTROLLED_ACTIONS: 'post',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: '',
    DISTRIATOR_ENABLED: 'false',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const calls = [];
  const rpcPool = {
    calls,
    getStatus: () => [],
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      throw new Error(`Unexpected Hive RPC method ${api}.${method}`);
    },
  };
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create(ACCOUNT);
  return { app: createApp({ config, logger, rpcPool, sessionStore }), calls, config, session, token };
}

function authorized(builder, fixture) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .set('x-csrf-token', fixture.session.csrfToken);
}

const POST = Object.freeze({
  title: 'M9 local fixture announcement',
  body: 'This is a deterministic local-only rehearsal. It is not a Hive broadcast.',
  permlink: 'm9-local-fixture-announcement',
  tags: ['reno'],
  author: 'attacker',
});

test('M9 admits exactly one fourthstreetbar community-post preflight with no RPC or signer request', async () => {
  const fixture = rehearsalApp();
  assert.deepEqual(fixture.config.hive.controlledAccounts, [ACCOUNT]);
  assert.deepEqual(fixture.config.hive.controlledActions, ['post']);
  assert.equal(fixture.config.payments.enabled, false);
  assert.equal(fixture.config.distriator.enabled, false);

  const response = await authorized(
    request(fixture.app).post('/api/social/preflight/post'),
    fixture,
  ).send(POST).expect(201);

  assert.equal(response.body.state, 'prepared');
  assert.equal(response.body.account, ACCOUNT);
  assert.equal(response.body.action, 'post');
  assert.equal(response.body.authority, 'Posting');
  assert.match(response.body.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(response.body.operations.length, 1);
  assert.deepEqual(response.body.operations[0][0], 'comment');
  assert.deepEqual(response.body.operations[0][1], {
    parent_author: '',
    parent_permlink: 'hive-108590',
    author: ACCOUNT,
    permlink: POST.permlink,
    title: POST.title,
    body: POST.body,
    json_metadata: JSON.stringify({
      tags: ['hive-108590', 'reno'],
      app: 'fourth-street-bar-app/0.1.0',
      format: 'markdown',
    }),
  });
  assert.equal(fixture.calls.length, 0);
});

test('M9 rejects every off-scope social, M4, and payment preflight before RPC', async () => {
  const fixture = rehearsalApp();
  for (const action of ['thread', 'follow']) {
    const response = await authorized(
      request(fixture.app).post(`/api/social/preflight/${action}`),
      fixture,
    ).send(POST).expect(503);
    assert.equal(response.body.error.code, 'CONTROLLED_ACTION_NOT_ALLOWED');
  }
  const m4 = await authorized(
    request(fixture.app).post('/api/m4/preflight/profile'),
    fixture,
  ).send({}).expect(503);
  assert.equal(m4.body.error.code, 'CONTROLLED_ACTION_NOT_ALLOWED');
  const payment = await authorized(
    request(fixture.app).post('/api/payments/preflight'),
    fixture,
  ).send({ uri: 'v4v-pos:ignored' }).expect(503);
  assert.equal(payment.body.error.code, 'CONTROLLED_ACTION_NOT_ALLOWED');
  assert.deepEqual(fixture.calls, []);
});

test('M9 keeps production-equivalent disabled mode fail-closed', async () => {
  const disabledConfig = configFrom({
    HIVE_WRITE_MODE: 'disabled',
    HIVE_CONTROLLED_ACTIONS: 'post',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: '',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const sessionStore = new SessionStore({ secret: disabledConfig.auth.sessionSecret, ttlMs: disabledConfig.auth.sessionTtlMs });
  const { session, token } = sessionStore.create(ACCOUNT);
  const app = createApp({ config: disabledConfig, logger, rpcPool: { getStatus: () => [], async call() { throw new Error('unexpected RPC'); } }, sessionStore });
  const response = await authorized(request(app).post('/api/social/preflight/post'), { session, token }).send(POST).expect(503);
  assert.equal(response.body.error.code, 'FEATURE_UNAVAILABLE');
});
