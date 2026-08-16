'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { createFixtureRpc } = require('./support/fixture-rpc');
const { logger } = require('./support/test-app');

const CACHE_CONTROL = 'private, no-cache, max-age=0, must-revalidate';

function productionSource() {
  return {
    NODE_ENV: 'production',
    PORT: '3000',
    BIND_HOST: '127.0.0.1',
    HIVE_BAR_HOST: 'fourthstreetbar.com',
    SITE_NAME: '4th Street Bar',
    BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
    BAR_PHONE: '(775) 324-7827',
    BAR_HOURS: 'Daily, 12:00 p.m.–2:00 a.m.',
    BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
    BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno',
    HIVE_COMMUNITY_ID: 'hive-108590',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
    HIVE_RPC_NODES:
      'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'disabled',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
    APP_ORIGIN: 'https://fourthstreetbar.com',
    SESSION_SECRET: 'm15-cache-coherence-test-secret-with-32-bytes',
    TRUST_PROXY: 'loopback',
    LOG_LEVEL: 'info',
  };
}

function productionApp() {
  const config = loadConfig(productionSource(), { loadDotenv: false });
  return createApp({ config, logger, rpcPool: createFixtureRpc() });
}

const STABLE_ASSETS = [
  ['/css/style.css', /text\/css/],
  ['/css/m15-social.css', /text\/css/],
  ['/images/fourth-street-bar-logo.jpg', /image\/jpeg/],
  ['/htmx/htmx.min.js', /javascript/],
  ['/vendor/zxing/zxing-browser.min.js', /javascript/],
];

test('M15.5.2 stable-path production assets cannot remain fresh across deployments', async () => {
  const app = productionApp();

  for (const [assetPath, contentType] of STABLE_ASSETS) {
    const response = await request(app).get(assetPath).expect(200).expect('content-type', contentType);

    assert.equal(response.headers['cache-control'], CACHE_CONTROL, assetPath);
    assert.ok(response.headers.etag, `${assetPath}: ETag must remain available for revalidation`);
    assert.doesNotMatch(response.headers['cache-control'], /(?:max-age=86400|immutable)/i, assetPath);

    const conditional = await request(app)
      .get(assetPath)
      .set('If-None-Match', response.headers.etag)
      .expect(304);

    assert.equal(conditional.headers['cache-control'], CACHE_CONTROL, assetPath);
    assert.equal(conditional.headers.etag, response.headers.etag, assetPath);
  }
});

test('M15.5.2 does not weaken no-store health responses', async () => {
  const app = productionApp();
  const response = await request(app).get('/healthz').expect(200);
  assert.match(response.headers['cache-control'], /no-store/);
});
