'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');

const logger = {
  child() {
    return this;
  },
  debug() {},
  error() {},
  fatal() {},
  info() {},
  warn() {},
};

function configFrom(overrides = {}) {
  return loadConfig(
    { NODE_ENV: 'test', HIVE_WRITE_MODE: 'disabled', RATE_LIMIT_MAX: '1000', ...overrides },
    { loadDotenv: false },
  );
}

function appWithRpc(call = async () => ({}), configOverrides = {}) {
  const rpcPool = { call, getStatus: () => [] };
  return createApp({ config: configFrom(configOverrides), logger, rpcPool });
}

test('renders one complete home document with hardened response headers', async () => {
  const response = await request(appWithRpc()).get('/').expect(200).expect('content-type', /html/);

  assert.equal((response.text.match(/<!doctype html>/gi) || []).length, 1);
  assert.equal((response.text.match(/<html\b/gi) || []).length, 1);
  assert.equal((response.text.match(/<body\b/gi) || []).length, 1);
  assert.equal((response.text.match(/<main\b/gi) || []).length, 1);
  assert.doesNotMatch(response.text, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(response.text, /<script(?![^>]*\bsrc=)/i);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.match(response.headers['content-security-policy'], /script-src-attr 'none'/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('serves local HTMX rather than a third-party runtime script', async () => {
  const response = await request(appWithRpc()).get('/htmx/htmx.min.js').expect(200);
  assert.match(response.headers['content-type'], /javascript/);
  assert.match(response.text, /htmx/i);
});

test('reports liveness without touching Hive and readiness through Hive', async () => {
  let calls = 0;
  const app = appWithRpc(async (api, method) => {
    calls += 1;
    assert.equal(api, 'condenser_api');
    assert.equal(method, 'get_dynamic_global_properties');
    return { head_block_number: 123 };
  });

  const health = await request(app).get('/healthz').expect(200);
  assert.deepEqual(health.body, {
    status: 'ok',
    service: 'hive-bar',
    environment: 'test',
    writeMode: 'disabled',
  });
  assert.equal(calls, 0);
  assert.match(health.headers['cache-control'], /no-store/);

  const ready = await request(app).get('/readyz').expect(200);
  assert.deepEqual(ready.body, { status: 'ready' });
  assert.equal(calls, 1);
});

test('reports a failed readiness probe without exposing the RPC failure', async () => {
  const app = appWithRpc(async () => {
    throw new Error('internal node detail');
  });

  const response = await request(app).get('/readyz').expect(503);
  assert.deepEqual(response.body, { status: 'not_ready' });
  assert.doesNotMatch(response.text, /internal node detail/);
});

test('returns structured validation errors without stack traces', async () => {
  const response = await request(appWithRpc())
    .get('/community/check-membership?username=INVALID!&community=hive-108590')
    .set('accept', 'application/json')
    .expect(400);

  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.equal(response.body.error.message, 'Hive account is invalid');
  assert.match(response.body.error.requestId, /^[0-9a-f-]{36}$/);
  assert.doesNotMatch(response.text, /at .*\.js:/);
});

test('keeps every write endpoint disabled during M1', async () => {
  const response = await request(appWithRpc()).post('/api/wall-post').send({ body: 'hello' }).expect(503);

  assert.equal(response.body.error.code, 'FEATURE_UNAVAILABLE');
  assert.match(response.body.error.message, /disabled during M1/);
});

test('rejects malformed and oversized request bodies with safe client errors', async () => {
  const app = appWithRpc();
  const malformed = await request(app)
    .post('/api/wall-post')
    .set('content-type', 'application/json')
    .send('{"body":')
    .expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  assert.doesNotMatch(malformed.text, /SyntaxError|at .*\.js:/);

  const oversized = await request(app)
    .post('/api/wall-post')
    .send({ body: 'x'.repeat(33 * 1024) })
    .expect(413);
  assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
  assert.doesNotMatch(oversized.text, /x{100}/);
});

test('rate limits application routes with a request-correlated error', async () => {
  const app = appWithRpc(async () => ({}), { RATE_LIMIT_MAX: '2' });

  await request(app).get('/').expect(200);
  await request(app).get('/').expect(200);
  const limited = await request(app).get('/').expect(429);

  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.match(limited.body.error.requestId, /^[0-9a-f-]{36}$/);
  assert.ok(limited.headers.ratelimit);
  assert.ok(limited.headers['retry-after']);
});

test('renders the approved empty production thread container as a sparse state', async () => {
  const app = appWithRpc(async (api, method, params) => {
    assert.equal(api, 'condenser_api');
    assert.equal(method, 'get_discussions_by_blog');
    assert.equal(params[0].tag, 'fourthst.threads');
    return [];
  });

  const response = await request(app).get('/community/threads').expect(200);
  assert.match(response.text, /No threads yet/);
  assert.match(response.text, /@fourthst\.threads/);
});

test('renders a safe, complete HTML 404 response', async () => {
  const response = await request(appWithRpc()).get('/does-not-exist').expect(404);

  assert.match(response.text, /Page not found/);
  assert.equal((response.text.match(/<html\b/gi) || []).length, 1);
  assert.doesNotMatch(response.text, /NotFoundError|at .*\.js:/);
});
