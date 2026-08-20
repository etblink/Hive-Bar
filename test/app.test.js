'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');

function appWithRpc(call = async () => ({}), configOverrides = {}) {
  const rpcPool = { call, getStatus: () => [] };
  return createApp({
    config: configFrom({ RATE_LIMIT_MAX: '1000', ...configOverrides }),
    logger,
    rpcPool,
  });
}

function assertNoExecutableMarkup(html) {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /<(?:iframe|object|embed|foreignObject)[^>]*>/i);
  assert.doesNotMatch((html.match(/<[^>]+>/g) || []).join(' '), /\son[a-z]+\s*=/i);
  assert.doesNotMatch((html.match(/<[^>]+>/g) || []).join(' '), /(?:href|src)=["']javascript:/i);

  const document = new JSDOM(html).window.document;
  const allowedSvgAttributes = new Set([
    'class', 'viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'aria-hidden', 'focusable',
  ]);
  const allowedShapeAttributes = new Set(['d', 'cx', 'cy', 'r']);
  for (const svg of document.querySelectorAll('svg')) {
    assert.ok(svg.matches('.app-primary-nav svg.app-nav-icon'));
    for (const attribute of svg.getAttributeNames()) assert.ok(allowedSvgAttributes.has(attribute));
    for (const shape of svg.querySelectorAll('*')) {
      assert.ok(['path', 'circle'].includes(shape.localName));
      for (const attribute of shape.getAttributeNames()) {
        assert.ok(allowedShapeAttributes.has(attribute));
      }
    }
  }
}

test('renders a truthful, complete home document with hardened response headers', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200).expect('content-type', /html/);

  assert.equal((response.text.match(/<!doctype html>/gi) || []).length, 1);
  assert.equal((response.text.match(/<html\b/gi) || []).length, 1);
  assert.equal((response.text.match(/<body\b/gi) || []).length, 1);
  assert.equal((response.text.match(/<main\b/gi) || []).length, 1);
  assert.match(response.text, /1114 E\. 4th Street, Reno, NV 89512/);
  assert.match(response.text, /\(775\) 324-7827/);
  assert.match(response.text, /Daily, 12:00 p\.m.–2:00 a\.m\./);
  assert.match(response.text, /Candid photographs from the pool table, the bar, and the East 4th Street entrance/);
  assert.match(response.text, /\/images\/fourth-street-bar-patio\.jpg/);
  assert.match(response.text, /\/images\/fourth-street-bar-pool-table\.jpg/);
  assert.match(response.text, /\/images\/fourth-street-bar-bartender\.jpg/);
  assert.match(response.text, /\/images\/fourth-street-bar-exterior\.jpg/);
  assert.equal((response.text.match(/loading="lazy"/g) || []).length, 3);
  assert.doesNotMatch(response.text, /Bar photos are coming|photo-placeholder/);
  assert.doesNotMatch(response.text, /John D\.|Sarah M\.|Mike R\.|images\.unsplash/);
  assert.doesNotMatch(response.text, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(response.text, /<script(?![^>]*\bsrc=)/i);
  assert.match(response.headers['content-security-policy'], /script-src 'self'/);
  assert.match(response.headers['content-security-policy'], /script-src-attr 'none'/);
  assert.match(response.headers['content-security-policy'], /img-src 'self' data: blob:/);
  assert.match(response.headers['content-security-policy'], /media-src 'self' blob:/);
  assert.doesNotMatch(response.headers['content-security-policy'], /unsplash|fourthstreetbar\.com/);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('renders only bounded official community-root updates on the home page', async () => {
  const calls = [];
  const app = appWithRpc(async (api, method, params) => {
    calls.push({ api, method, params });
    assert.equal(api, 'bridge');
    assert.equal(method, 'get_ranked_posts');
    return [
      {
        author: 'fourthstreetbar', permlink: 'official-update', parent_author: '',
        parent_permlink: 'hive-108590', title: 'Official <update>', body: 'Fresh news', active_votes: [],
      },
      {
        author: 'someoneelse', permlink: 'not-official', parent_author: '',
        parent_permlink: 'hive-108590', title: 'Do not show', body: 'Nope', active_votes: [],
      },
      {
        author: 'fourthstreetbar', permlink: 'reply', parent_author: 'someoneelse',
        parent_permlink: 'not-official', title: 'Do not show reply', body: 'Nope', active_votes: [],
      },
    ];
  });

  const response = await request(app).get('/').expect(200);
  assert.match(response.text, /Latest from the bar/);
  assert.match(response.text, /Official &lt;update&gt;/);
  assert.match(response.text, /Fresh news/);
  assert.doesNotMatch(response.text, /Do not show/);
  assert.match(response.text, /\/post\/fourthstreetbar\/official-update/);
  assert.deepEqual(calls, [{
    api: 'bridge', method: 'get_ranked_posts',
    params: { tag: 'hive-108590', sort: 'created', limit: 25 },
  }]);
});

test('keeps the home page available when official updates cannot be read', async () => {
  const app = appWithRpc(async () => {
    throw new Error('sensitive RPC outage detail');
  });
  const response = await request(app).get('/').expect(200);
  assert.match(response.text, /Latest updates are temporarily unavailable/);
  assert.doesNotMatch(response.text, /sensitive RPC outage detail/);
});

test('serves local HTMX rather than a third-party runtime script', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/htmx/htmx.min.js').expect(200);
  assert.match(response.headers['content-type'], /javascript/);
  assert.match(response.text, /htmx/i);
});

test('serves the pinned QR reader locally rather than from a third-party CDN', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/vendor/zxing/zxing-browser.min.js').expect(200);
  assert.match(response.headers['content-type'], /javascript/);
  assert.match(response.text, /ZXingBrowser/);
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

test('renders the one-post community with one bounded container read and no per-post RPC calls', async () => {
  const { app, rpcPool } = createFixtureApp();
  const response = await request(app).get('/community').expect(200);

  assert.match(response.text, /Welcome to the 4th Street Bar community/);
  assert.equal((response.text.match(/Welcome to the 4th Street Bar community/g) || []).length, 1);
  assert.match(response.text, /1 upvotes/);
  assert.match(response.text, /1 downvotes/);
  assert.doesNotMatch(response.text, /No posts|Loading community activity/);
  assertNoExecutableMarkup(response.text);

  const methods = rpcPool.calls.map((call) => `${call.api}.${call.method}`);
  assert.deepEqual(methods, [
    'bridge.get_community',
    'bridge.get_account_posts',
    'bridge.get_ranked_posts',
    'bridge.get_profiles',
  ]);
  assert.deepEqual(rpcPool.calls[1].params, {
    sort: 'posts',
    account: 'fourthst.threads',
    limit: 1,
  });
  assert.equal(rpcPool.calls[2].params.tag, 'hive-108590');
  assert.equal(rpcPool.calls[2].params.sort, 'created');
});

test('keeps community information visible when only the post feed fails', async () => {
  const rpcPool = {
    getStatus: () => [],
    async call(api, method) {
      if (`${api}.${method}` === 'bridge.get_community') {
        return { name: 'hive-108590', title: '4th Street Bar', subscribers: 1 };
      }
      throw new Error('feed only failure');
    },
  };
  const app = createApp({ config: configFrom(), logger, rpcPool });
  const response = await request(app).get('/community').expect(200);

  assert.match(response.text, /4th Street Bar/);
  assert.match(response.text, /Posts are temporarily unavailable/);
  assert.match(response.text, /Try again/);
  assert.doesNotMatch(response.text, /feed only failure/);
});

test('renders the approved empty production thread state honestly', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/community/threads').expect(200);

  assert.match(response.text, /No threads yet/);
  assert.match(response.text, /Short posts and replies will appear here|Threads aren’t available yet/);
  assert.match(response.text, /<!doctype html>/i);
});

test('renders a full post and sanitized flattened comments as a complete or HTMX response', async () => {
  const { app } = createFixtureApp();
  const path = '/post/etblink/welcome-fourth-street-bar';
  const full = await request(app).get(path).expect(200);

  assert.match(full.text, /<!doctype html>/i);
  assert.match(full.text, /Pull up a stool/);
  assert.match(full.text, /Glad to be here/);
  assert.match(full.text, /Replies <span[^>]*>\(1\)/);
  assertNoExecutableMarkup(full.text);

  const fragment = await request(app).get(path).set('HX-Request', 'true').expect(200);
  assert.doesNotMatch(fragment.text, /<!doctype html>/i);
  assert.match(fragment.text, /Glad to be here/);
});

test('renders escaped public profile metadata and paginated posts', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/barfriend').expect(200);

  assert.match(response.text, /Bar Friend &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(response.text, /<script>alert\(1\)<\/script>/);
  assert.match(response.text, /Glad|Welcome to the 4th Street Bar community/);
  assert.match(response.text, /https:\/\/images\.hive\.blog\/u\/barfriend\/avatar/);
});

test('renders exact regenerated wallet values beneath accessible beer visuals', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/etblink/wallet').expect(200);

  assert.match(response.text, /550\.000 HP/);
  assert.match(response.text, /70\.00%/);
  assert.match(response.text, /60\.00%/);
  assert.match(response.text, /Regular Drinker/);
  assert.equal((response.text.match(/beer-segment--filled/g) || []).length, 7);
  assert.match(response.text, /Updated at/);
  assert.match(response.text, /cannot move funds/);
});

test('rejects malformed pagination cursors and account inputs without stack traces', async () => {
  const { app } = createFixtureApp();
  const cursor = await request(app)
    .get('/community/hive-108590/community-posts?after=not+base64!')
    .set('accept', 'application/json')
    .expect(400);
  assert.equal(cursor.body.error.message, 'Pagination cursor is invalid');

  const connectionCursor = await request(app)
    .get('/profile/etblink/followers?after=not+base64!')
    .set('accept', 'application/json')
    .expect(400);
  assert.equal(connectionCursor.body.error.message, 'Connection pagination cursor is invalid');

  const account = await request(app)
    .get('/community/check-membership?username=INVALID!&community=hive-108590')
    .set('accept', 'application/json')
    .expect(400);
  assert.equal(account.body.error.code, 'VALIDATION_ERROR');
  assert.equal(account.body.error.message, 'Hive account is invalid');
  assert.doesNotMatch(account.text, /at .*\.js:/);
});

test('keeps the legacy wall-write endpoint disabled in favor of verified M4 preflight', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).post('/api/wall-post').send({ body: 'hello' }).expect(503);

  assert.equal(response.body.error.code, 'FEATURE_UNAVAILABLE');
  assert.match(response.body.error.message, /verified, session-bound M4 preflight flow/);
});

test('rejects malformed and oversized request bodies with safe client errors', async () => {
  const { app } = createFixtureApp();
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

test('renders a safe, complete HTML 404 response', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/does-not-exist').expect(404);

  assert.match(response.text, /Page not found/);
  assert.equal((response.text.match(/<html\b/gi) || []).length, 1);
  assert.doesNotMatch(response.text, /NotFoundError|at .*\.js:/);
});
