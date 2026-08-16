'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, logger } = require('./support/test-app');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';

function controlledApp({ account = 'etblink', allowlist = 'etblink', writeMode = 'controlled' } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: writeMode,
    HIVE_CONTROLLED_ACCOUNTS: writeMode === 'controlled' ? allowlist : '',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const calls = [];
  const rpcPool = {
    calls,
    getStatus: () => [],
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      if (`${api}.${method}` === 'bridge.get_post') {
        return { author: params.author, permlink: params.permlink, active_votes: [] };
      }
      throw new Error(`Unexpected RPC method ${api}.${method}`);
    },
  };
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create(account);
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, calls, session, token };
}

function authorized(builder, fixture) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .set('x-csrf-token', fixture.session.csrfToken);
}

const POST_PAYLOAD = {
  title: 'Controlled M3 vector',
  body: 'This is a fixture-only social operation.',
  permlink: 'controlled-m3-vector',
  tags: ['reno'],
  author: 'attacker',
};

test('preflights an exact session-owned operation, blocks duplicates, and releases cancellation', async () => {
  const fixture = controlledApp();
  const first = await authorized(
    request(fixture.app).post('/api/social/preflight/post'),
    fixture,
  )
    .send(POST_PAYLOAD)
    .expect(201);

  assert.equal(first.body.account, 'etblink');
  assert.equal(first.body.authority, 'Posting');
  assert.equal(first.body.broadcastMode, 'controlled');
  assert.equal(first.body.state, 'prepared');
  assert.equal(first.body.operations[0][1].author, 'etblink');
  assert.equal(first.body.operations[0][1].parent_permlink, 'hive-108590');
  assert.equal(fixture.calls.length, 0);

  const duplicate = await authorized(
    request(fixture.app).post('/api/social/preflight/post'),
    fixture,
  )
    .send(POST_PAYLOAD)
    .expect(409);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_OPERATION');

  await authorized(
    request(fixture.app).post(`/api/social/preflight/${first.body.id}/cancel`),
    fixture,
  ).expect(204);
  await authorized(request(fixture.app).post('/api/social/preflight/post'), fixture)
    .send(POST_PAYLOAD)
    .expect(201);
});

test('records Keychain acceptance and remains pending until Hive confirmation', async () => {
  const fixture = controlledApp();
  const preflight = await authorized(
    request(fixture.app).post('/api/social/preflight/post'),
    fixture,
  )
    .send(POST_PAYLOAD)
    .expect(201);

  const invalid = await authorized(
    request(fixture.app).post(`/api/social/preflight/${preflight.body.id}/accepted`),
    fixture,
  )
    .send({ transactionId: 'not-a-transaction' })
    .expect(400);
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');

  const accepted = await authorized(
    request(fixture.app).post(`/api/social/preflight/${preflight.body.id}/accepted`),
    fixture,
  )
    .send({ transactionId: 'a'.repeat(40) })
    .expect(200);
  assert.equal(accepted.body.state, 'broadcast_accepted');
  assert.match(accepted.body.message, /Waiting for Hive to confirm it/);

  const observed = await authorized(
    request(fixture.app).post(`/api/social/preflight/${preflight.body.id}/observe`),
    fixture,
  ).expect(200);
  assert.equal(observed.body.state, 'observed');
  assert.equal(observed.body.transactionId, 'a'.repeat(40));
  assert.equal(observed.body.message, 'Confirmed on Hive.');
  assert.deepEqual(fixture.calls, [
    {
      api: 'bridge',
      method: 'get_post',
      params: { author: 'etblink', permlink: 'controlled-m3-vector' },
    },
  ]);
});

test('fails closed outside explicit controlled mode and for accounts outside its allowlist', async () => {
  const disabled = controlledApp({ writeMode: 'disabled' });
  const unavailable = await authorized(
    request(disabled.app).post('/api/social/preflight/post'),
    disabled,
  )
    .send(POST_PAYLOAD)
    .expect(503);
  assert.equal(unavailable.body.error.code, 'FEATURE_UNAVAILABLE');
  assert.equal(unavailable.body.error.message, 'This action isn’t available right now.');
  assert.equal(disabled.calls.length, 0);

  const notAllowed = controlledApp({ account: 'barfriend', allowlist: 'etblink' });
  const forbidden = await authorized(
    request(notAllowed.app).post('/api/social/preflight/post'),
    notAllowed,
  )
    .send(POST_PAYLOAD)
    .expect(403);
  assert.equal(forbidden.body.error.code, 'CONTROLLED_ACCOUNT_NOT_ALLOWED');
  assert.equal(notAllowed.calls.length, 0);
});

test('requires the verified session, same origin, and CSRF token for every social transition', async () => {
  const fixture = controlledApp();
  await request(fixture.app)
    .post('/api/social/preflight/post')
    .set('origin', ORIGIN)
    .send(POST_PAYLOAD)
    .expect(401)
    .expect(({ body }) => assert.equal(body.error.code, 'SESSION_REQUIRED'));

  await request(fixture.app)
    .post('/api/social/preflight/post')
    .set('origin', 'https://attacker.example')
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .set('x-csrf-token', fixture.session.csrfToken)
    .send(POST_PAYLOAD)
    .expect(403)
    .expect(({ body }) => assert.equal(body.error.code, 'ORIGIN_NOT_ALLOWED'));

  await request(fixture.app)
    .post('/api/social/preflight/post')
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .set('x-csrf-token', 'wrong')
    .send(POST_PAYLOAD)
    .expect(403)
    .expect(({ body }) => assert.equal(body.error.code, 'CSRF_INVALID'));
});
