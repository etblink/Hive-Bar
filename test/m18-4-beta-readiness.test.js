'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const fixture = require('./fixtures/hive/m2-read-slice.json');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const ROOT = path.join(__dirname, '..');
const M18_3_COMMIT = '524732a18559858bf20d2976cb5b791d6eaa36c8';
const M18_3_TREE = 'ea2c5742f65669f8e5842fc2b357da821e893325';
const SESSION_SECRET = 'm18-4-beta-readiness-test-session-secret-32-bytes';

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function emptyConnectionsApp() {
  const rpcPool = {
    getStatus: () => [],
    async call(api, method, params) {
      const key = `${api}.${method}`;
      if (key === 'bridge.get_profile') {
        return structuredClone(
          fixture.profiles.find((profile) => profile.name === params.account) || null,
        );
      }
      if (key === 'condenser_api.get_followers') return [];
      if (key === 'condenser_api.get_following') return [];
      throw new Error(`Unexpected M18.4 empty-connection RPC: ${key}`);
    },
  };
  return createApp({
    config: configFrom({ RATE_LIMIT_MAX: '1000' }),
    logger,
    rpcPool,
  });
}

function betaSignedInApp(account = 'barfriend') {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create(account);
  return {
    app: createApp({
      config,
      logger,
      rpcPool: createFixtureRpc(),
      sessionStore,
    }),
    cookie: `hive_bar_session=${token}`,
  };
}

test('M18.4 renders successful empty Followers and Following states in full and HTMX responses', async () => {
  const app = emptyConnectionsApp();
  const cases = [
    ['followers', 'This account has no followers yet.'],
    ['following', 'This account is not following anyone yet.'],
  ];

  for (const [kind, message] of cases) {
    const full = await request(app).get(`/profile/etblink/${kind}`).expect(200);
    assert.match(full.text, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(full.text, /Internal server error|ReferenceError|error is not defined/i);

    const fragment = await request(app)
      .get(`/profile/etblink/${kind}`)
      .set('HX-Request', 'true')
      .expect(200);
    assert.match(fragment.text, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(fragment.text, /<!doctype html>/i);
    assert.doesNotMatch(fragment.text, /ReferenceError|error is not defined/i);
  }
});

test('M18.4 profile copy distinguishes sign-in-required from release-unavailable Follow state', async () => {
  const signedOut = createFixtureApp();
  const signedOutProfile = await request(signedOut.app).get('/profile/etblink').expect(200);
  assert.match(signedOutProfile.text, /Sign in with Hive Keychain to follow @etblink\./);
  assert.doesNotMatch(signedOutProfile.text, /Following isn’t available in this release yet\./);

  const beta = betaSignedInApp('barfriend');
  const betaProfile = await request(beta.app)
    .get('/profile/etblink')
    .set('cookie', beta.cookie)
    .expect(200);
  assert.match(betaProfile.text, /Following isn’t available in this release yet\./);
  assert.doesNotMatch(betaProfile.text, /Sign in with Hive Keychain to follow @etblink\./);
});

test('M18.4 keeps exact UTF-8 byte enforcement while simplifying visible length counters', () => {
  const client = source('public/js/social-actions.js');
  assert.match(client, /new TextEncoder\(\)\.encode\(input\.value\)\.byteLength/);
  assert.match(client, /bytes > maximum/);
  assert.match(client, /This text is too long\. Shorten it and try again\./);
  assert.match(client, /maximum\.toLocaleString\(\)\} used/);
  assert.doesNotMatch(client, /byte limit/i);

  const templates = [
    'views/pages/community/partials/community-post-list.ejs',
    'views/pages/community/partials/community-thread-list.ejs',
    'views/common/comment.ejs',
    'views/partials/full-post.ejs',
    'views/pages/profile/partials/wall-posts.ejs',
    'views/pages/profile/partials/settings.ejs',
  ];
  for (const filename of templates) {
    const text = source(filename);
    assert.match(text, /data-max-bytes=/, filename);
    assert.match(text, /data-byte-counter/, filename);
    assert.doesNotMatch(text, /byte limit/i, filename);
  }
});

test('M18.4 living documentation binds accepted M18.3 source and unchanged M17.3 production truth', () => {
  for (const filename of ['README.md', 'docs/README.md', 'docs/ROADMAP.md']) {
    const text = source(filename);
    assert.match(text, new RegExp(M18_3_COMMIT), filename);
    assert.match(text, new RegExp(M18_3_TREE), filename);
    assert.match(text, /M17\.3/, filename);
    assert.match(text, /beta/i, filename);
    assert.match(text, /M18\.4/, filename);
  }

  const milestone = source('docs/M18_4_BETA_READINESS_CLOSURE.md');
  assert.match(milestone, /source-qualification candidate/i);
  assert.match(milestone, new RegExp(M18_3_COMMIT));
  assert.match(milestone, /does not authorize `main` integration, production deployment, V1 activation/i);
});

test('M18.4 live smoke extends the disabled-write lane to Followers and Following reads only', () => {
  const smoke = source('scripts/live-read-smoke.js');
  assert.match(smoke, /config\.hive\.writeMode, 'disabled'/);
  assert.match(smoke, /config\.hive\.writesEnabled, false/);
  assert.match(smoke, /reads\.getFollowers\(/);
  assert.match(smoke, /reads\.getFollowing\(/);
  assert.doesNotMatch(smoke, /broadcast|requestBroadcast|requestTransfer|requestCustomJson/i);
});

test('M18.4 targeted visual harness freezes local-only read models and the accepted viewport set', () => {
  const harness = source('scripts/capture-m18-4-visual.js');
  for (const width of [360, 390, 768, 1024, 1440, 1600]) {
    assert.match(harness, new RegExp(`\\b${width}\\b`));
  }
  for (const scenario of [
    'followers-empty',
    'following-empty',
    'community-composer',
    'post-reply-composer',
    'wallet',
    'inbox-settings',
  ]) {
    assert.match(harness, new RegExp(scenario));
  }
  assert.match(harness, /M18_4_VISUAL_MUTATION_FORBIDDEN/);
  assert.match(harness, /forbids Hive RPC/);
  assert.match(harness, /__M18_4_KEYCHAIN_DISABLED__/);
  assert.match(harness, /unexpectedNetwork/);
});
