'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { loadConfig } = require('../src/config');
const { metadataRevision } = require('../src/hive/profile-settings');
const { RELEASE_APP_TAG } = require('../src/release/release-version');
const { loadV1Config } = require('../scripts/check-v1-release');
const { qualifyPrivexRuntime } = require('../scripts/start-privex');
const { BETA_ACTIONS } = require('../src/beta/actions');
const {
  V1_ACTIONS,
  V1_M4_ACTIONS,
  V1_SOCIAL_ACTIONS,
} = require('../src/v1/actions');
const { createFixtureRpc, fixture } = require('./support/fixture-rpc');
const { logger } = require('./support/test-app');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'm17-runtime-v1-test-secret-that-is-at-least-32-bytes';

function runtimeV1Config(overrides = {}) {
  return loadConfig(
    {
      NODE_ENV: 'test',
      HIVE_WRITE_MODE: 'production',
      HIVE_SIGNER_MODE: 'keychain',
      HIVE_CONTROLLED_ACCOUNTS: '',
      HIVE_CONTROLLED_ACTIONS: '',
      SESSION_SECRET,
      RATE_LIMIT_MAX: '1000',
      ...overrides,
    },
    { loadDotenv: false, allowV1Production: true },
  );
}

function v1Source(overrides = {}) {
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
    HIVE_OFFICIAL_BAR_ACCOUNT: 'fourthstreetbar',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
    HIVE_RPC_NODES:
      'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'production',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_CONTROLLED_ACTIONS: '',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: RELEASE_APP_TAG,
    APP_ORIGIN: 'https://fourthstreetbar.com',
    SESSION_SECRET,
    TRUST_PROXY: 'loopback',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

function v1Fixture(account = 'barfriend') {
  const config = runtimeV1Config();
  const rpcPool = createFixtureRpc();
  const fixtureCall = rpcPool.call.bind(rpcPool);
  const threadContainer = {
    ...structuredClone(fixture.communityPosts[0]),
    author: 'fourthst.threads',
    permlink: 'hive-bar-thread-container',
    parent_author: '',
    parent_permlink: 'hive-108590',
  };
  rpcPool.call = async (api, method, params) => {
    if (
      `${api}.${method}` === 'bridge.get_account_posts' &&
      params?.account === 'fourthst.threads'
    ) {
      return [structuredClone(threadContainer)];
    }
    if (
      `${api}.${method}` === 'bridge.get_discussion' &&
      params?.author === 'fourthst.threads'
    ) {
      return [structuredClone(threadContainer)];
    }
    return fixtureCall(api, method, params);
  };
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create(account);
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, config, rpcPool, session, token };
}

function authorized(builder, fixtureApp) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .set('x-csrf-token', fixtureApp.session.csrfToken);
}

test('M17.3 keeps unqualified production mode fail-closed and parses real production only through the V1 loader boundary', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'test', HIVE_WRITE_MODE: 'production' }, { loadDotenv: false }),
    /Production write mode is not authorized before the V1 release gate/,
  );

  const runtime = runtimeV1Config();
  assert.equal(runtime.hive.writeMode, 'production');
  assert.equal(runtime.hive.signerMode, 'keychain');
  assert.equal(runtime.hive.v1SelfSigningEnabled, true);
  assert.equal(runtime.hive.betaSelfSigningEnabled, false);
  assert.equal(runtime.hive.writesEnabled, false);

  const source = v1Source();
  const production = loadV1Config(source);
  assert.equal(production.hive.writeMode, 'production');
  assert.equal(production.hive.v1SelfSigningEnabled, true);
  assert.equal(production.hive.betaSelfSigningEnabled, false);
  assert.equal(qualifyPrivexRuntime(production, source).profile, 'privex-v1-self-signing');
});

test('M20.2 supersedes the route subsets with the twelve-action V1 and ten-action beta manifests', () => {
  assert.deepEqual(V1_SOCIAL_ACTIONS, [
    'post', 'thread', 'comment', 'vote', 'follow', 'unfollow', 'subscribe', 'unsubscribe',
  ]);
  assert.deepEqual(V1_M4_ACTIONS, ['profile', 'claim-rewards', 'wall', 'inbox']);
  assert.deepEqual(V1_ACTIONS, [
    'post', 'thread', 'comment', 'vote', 'follow', 'unfollow', 'subscribe', 'unsubscribe',
    'profile', 'claim-rewards', 'wall', 'inbox',
  ]);
  assert.deepEqual(BETA_ACTIONS, [
    'post', 'comment', 'vote', 'follow', 'unfollow', 'subscribe', 'unsubscribe',
    'claim-rewards', 'wall', 'inbox',
  ]);
});

test('M17.3 V1 social preflights are session-owned, Keychain self-signing, and never controlled-mode fallthrough', async () => {
  const fixtureApp = v1Fixture();
  const cases = [
    ['post', {
      title: 'V1 post',
      body: 'Prepared by the verified V1 session.',
      permlink: 'm17-v1-post',
      tags: ['reno'],
      author: 'attacker',
    }],
    ['thread', { body: 'V1 thread', permlink: 'm17-v1-thread', author: 'attacker' }],
    ['comment', {
      body: 'V1 reply',
      permlink: 'm17-v1-comment',
      parentAuthor: 'etblink',
      parentPermlink: 'welcome-fourth-street-bar',
      author: 'attacker',
    }],
    ['vote', {
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      direction: 'upvote',
      percent: 3,
      voter: 'attacker',
    }],
    ['follow', { following: 'etblink', follower: 'attacker' }],
    ['unfollow', { following: 'etblink', follower: 'attacker' }],
    ['subscribe', { account: 'attacker' }],
    ['unsubscribe', { account: 'attacker' }],
  ];

  for (const [action, payload] of cases) {
    const response = await authorized(
      request(fixtureApp.app).post(`/api/social/preflight/${action}`),
      fixtureApp,
    )
      .send(payload)
      .expect(201);

    assert.equal(response.body.action, action);
    assert.equal(response.body.account, 'barfriend');
    assert.equal(response.body.signer, 'barfriend');
    assert.equal(response.body.authority, 'Posting');
    assert.equal(response.body.broadcastMode, 'v1-self');
    assert.doesNotMatch(JSON.stringify(response.body.operations), /attacker/);
  }

  await authorized(
    request(fixtureApp.app).post('/api/social/preflight/payment'),
    fixtureApp,
  )
    .send({})
    .expect(503)
    .expect(({ body }) => assert.equal(body.error.code, 'V1_ACTION_NOT_ALLOWED'));
});

test('M20.2 V1 M4 preflights include profile, reward claim, Wall, and Inbox while Pay stays excluded', async () => {
  const fixtureApp = v1Fixture();
  const account = fixture.accounts.find((item) => item.name === 'barfriend');
  const profile = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/profile'),
    fixtureApp,
  )
    .send({
      baseRevision: metadataRevision(account.posting_json_metadata),
      displayName: 'Bar Friend',
      about: 'M17 V1 profile rehearsal.',
      profileImage: 'https://images.hive.blog/u/barfriend/avatar',
      wallFee: '1.000 HBD',
      blocklist: '',
    })
    .expect(201);
  assert.equal(profile.body.account, 'barfriend');
  assert.equal(profile.body.authority, 'Posting');
  assert.equal(profile.body.broadcastMode, 'v1-self');
  assert.equal(profile.body.operations[0][0], 'account_update2');

  const wall = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/wall'),
    fixtureApp,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      message: 'M17 V1 Wall rehearsal.',
      from: 'attacker',
    })
    .expect(201);
  assert.equal(wall.body.account, 'barfriend');
  assert.equal(wall.body.authority, 'Active');
  assert.equal(wall.body.broadcastMode, 'v1-self');
  assert.equal(wall.body.operations[0][1].from, 'barfriend');

  const inbox = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/inbox'),
    fixtureApp,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      ciphertext: '#8m17fixtureciphertext',
      from: 'attacker',
    })
    .expect(201);
  assert.equal(inbox.body.account, 'barfriend');
  assert.equal(inbox.body.authority, 'Active');
  assert.equal(inbox.body.broadcastMode, 'v1-self');
  assert.equal(inbox.body.operations[0][1].from, 'barfriend');

  const rewardFixture = v1Fixture('etblink');
  const claim = await authorized(
    request(rewardFixture.app).post('/api/m4/preflight/claim-rewards'),
    rewardFixture,
  )
    .send({})
    .expect(201);
  assert.equal(claim.body.account, 'etblink');
  assert.equal(claim.body.authority, 'Posting');
  assert.equal(claim.body.broadcastMode, 'v1-self');
  assert.equal(claim.body.operations[0][0], 'claim_reward_balance');
  assert.equal(claim.body.operations[0][1].account, 'etblink');

  assert.equal(fixtureApp.app.locals.paymentsEnabled, false);
  assert.equal(fixtureApp.app.locals.canWriteAction('profile'), true);
  assert.equal(fixtureApp.app.locals.canWriteAction('wall'), true);
  assert.equal(fixtureApp.app.locals.canWriteAction('inbox'), true);
  assert.equal(fixtureApp.app.locals.canWriteAction('claim-rewards'), true);
  assert.equal(fixtureApp.app.locals.canWriteAction('payment'), false);
});

test('M17.3 monitoring is production-identity strict but profile-neutral', () => {
  const healthcheck = fs.readFileSync(
    path.join(__dirname, '..', 'ops', 'privex', 'bin', 'hive-bar-healthcheck'),
    'utf8',
  );
  assert.match(healthcheck, /'\"status\":\"ok\"'/);
  assert.match(healthcheck, /'\"service\":\"hive-bar\"'/);
  assert.match(healthcheck, /'\"environment\":\"production\"'/);
  for (const mode of ['disabled', 'beta', 'production', 'controlled']) {
    assert.match(healthcheck, new RegExp(`writeMode\\\":\\\"${mode}`));
  }
  assert.doesNotMatch(healthcheck, /systemctl\s+(?:restart|start)|requestBroadcast|broadcast_transaction/);
});
