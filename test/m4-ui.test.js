'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';

function signedInApp(account = 'etblink', writeMode = 'controlled') {
  const config = configFrom({
    HIVE_WRITE_MODE: writeMode,
    HIVE_CONTROLLED_ACCOUNTS: writeMode === 'controlled' ? account : '',
    HIVE_GLOBAL_WALL_EXCLUSIONS: 'rewardbot',
    SESSION_SECRET,
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create(account);
  return {
    app: createApp({ config, logger, rpcPool: createFixtureRpc(), sessionStore }),
    cookie: `hive_bar_session=${token}`,
  };
}

function paginatedFollowerRpc(names) {
  const fixtureRpc = createFixtureRpc();
  const calls = [];
  return {
    ...fixtureRpc,
    calls,
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      if (api === 'condenser_api' && method === 'get_followers') {
        const startIndex = params[1] ? names.indexOf(params[1]) : 0;
        if (startIndex < 0) return [];
        return names
          .slice(startIndex, startIndex + params[3])
          .map((follower) => ({ follower, following: params[0], what: ['blog'] }));
      }
      if (api === 'bridge' && method === 'get_profiles') return [];
      return fixtureRpc.call(api, method, params);
    },
  };
}

test('renders only qualifying public wall messages with fee and permanence disclosure', async () => {
  const { app } = createFixtureApp({
    configOverrides: { HIVE_GLOBAL_WALL_EXCLUSIONS: 'rewardbot' },
  });
  const response = await request(app).get('/profile/etblink/wall-posts').expect(200);
  assert.match(response.text, /Posting a wall message costs at least <strong[^>]*>1\.000 HBD/);
  assert.match(response.text, /Welcome to the neighborhood\./);
  assert.match(response.text, /permanently visible on Hive/);
  assert.doesNotMatch(response.text, /ordinary transfer|Below fee|Outbound|Service noise/);
  assert.doesNotMatch(response.text, /hivebar-wall:v1:/);
  assert.match(response.text, /Sign in with Hive Keychain/);
});

test('returns only classified public wall messages from the legacy transactions read route', async () => {
  const { app } = createFixtureApp({
    configOverrides: { HIVE_GLOBAL_WALL_EXCLUSIONS: 'rewardbot' },
  });
  const response = await request(app).get('/api/transactions/etblink').expect(200);

  assert.equal(response.body.account, 'etblink');
  assert.equal(response.body.minimumFee, '1.000 HBD');
  assert.equal(response.body.items.length, 1);
  assert.deepEqual(
    {
      sender: response.body.items[0].sender,
      recipient: response.body.items[0].recipient,
      amount: response.body.items[0].amount,
      message: response.body.items[0].message,
      transactionId: response.body.items[0].transactionId,
    },
    {
      sender: 'barfriend',
      recipient: 'etblink',
      amount: '1.000 HBD',
      message: 'Welcome to the neighborhood.',
      transactionId: '1111111111111111111111111111111111111111',
    },
  );
  assert.doesNotMatch(JSON.stringify(response.body), /ordinary transfer|Below fee|Outbound|Service noise/);
});

test('enforces verified ownership for inbox and settings routes', async () => {
  const { app } = createFixtureApp();
  await request(app).get('/profile/etblink/inbox').expect(401);
  await request(app).get('/profile/etblink/settings').expect(401);

  const other = signedInApp('barfriend');
  await request(other.app)
    .get('/profile/etblink/inbox')
    .set('cookie', other.cookie)
    .expect(403);
  await request(other.app)
    .get('/profile/etblink/settings')
    .set('cookie', other.cookie)
    .expect(403);
});

test('owner pages expose safe settings, reward claim, and local-only decrypt controls', async () => {
  const owner = signedInApp();
  const settings = await request(owner.app)
    .get('/profile/etblink/settings')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(settings.text, /data-m4-action="profile"/);
  assert.match(settings.text, /value="1\.000 HBD"/);
  assert.match(settings.text, /spammer/);
  assert.match(settings.text, /unrelated settings from other apps stay intact/);

  const wallet = await request(owner.app)
    .get('/profile/etblink/wallet')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(wallet.text, /data-m4-action="claim-rewards"/);
  assert.match(wallet.text, /checks your current rewards again/i);

  const inbox = await request(owner.app)
    .get('/profile/etblink/inbox')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(inbox.text, /data-inbox-ciphertext="#8fixtureciphertext"/);
  assert.match(inbox.text, /Hive Keychain uses your Memo key in this browser/);
  assert.doesNotMatch(inbox.text, /Welcome to the neighborhood|ordinary transfer/);
  assert.match(inbox.headers['cache-control'], /no-store/);
});

test('public connection tabs and unified message composer remain available without exposing owner pages', async () => {
  const signedIn = signedInApp('barfriend');
  const followers = await request(signedIn.app).get('/profile/etblink/followers').expect(200);
  assert.match(followers.text, /@etblink followers/);
  assert.match(followers.text, /barfriend/);

  const wall = await request(signedIn.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', signedIn.cookie)
    .expect(200);
  assert.match(wall.text, /data-wall-privacy-form/);
  assert.match(wall.text, /data-m4-action="wall"/);
  assert.match(wall.text, /data-wall-privacy-toggle/);
  assert.match(wall.text, /Encrypt this message \(private\)/);
  assert.match(wall.text, /encrypted with Hive Keychain in this browser/);
  assert.doesNotMatch(wall.text, /data-m4-action="inbox"/);
  assert.doesNotMatch(wall.text, /href="\/profile\/etblink\/settings"/);
});

test('follower pages expose a continuation cursor without duplicating the inclusive anchor', async () => {
  const names = Array.from(
    { length: 13 },
    (_, index) => `friend${String(index + 1).padStart(2, '0')}`,
  );
  const rpcPool = paginatedFollowerRpc(names);
  const { app } = createFixtureApp({ rpcPool });
  const first = await request(app).get('/profile/etblink/followers').expect(200);

  assert.match(first.text, /\/profile\/friend01/);
  assert.match(first.text, /https:\/\/images\.hive\.blog\/u\/friend01\/avatar\/small/);
  assert.match(first.text, /\/profile\/friend10/);
  assert.doesNotMatch(first.text, /\/profile\/friend11/);
  const nextPage = first.text.match(
    /href="(\/profile\/etblink\/followers\?after=[A-Za-z0-9_-]+)"/,
  );
  assert.ok(nextPage, 'first follower page should render a continuation link');

  const second = await request(app).get(nextPage[1]).expect(200);
  assert.doesNotMatch(second.text, /\/profile\/friend10/);
  assert.match(second.text, /\/profile\/friend11/);
  assert.match(second.text, /\/profile\/friend13/);
  assert.doesNotMatch(second.text, /followers\?after=/);

  const followerCalls = rpcPool.calls.filter((call) => call.method === 'get_followers');
  assert.deepEqual(followerCalls[0].params, ['etblink', '', 'blog', 11]);
  assert.deepEqual(followerCalls[1].params.slice(0, 3), ['etblink', 'friend10', 'blog']);
  assert.equal(followerCalls[1].params[3], 12);
});
