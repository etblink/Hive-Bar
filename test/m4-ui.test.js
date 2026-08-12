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

test('renders only qualifying public wall messages with fee and permanence disclosure', async () => {
  const { app } = createFixtureApp({
    configOverrides: { HIVE_GLOBAL_WALL_EXCLUSIONS: 'rewardbot' },
  });
  const response = await request(app).get('/profile/etblink/wall-posts').expect(200);
  assert.match(response.text, /Minimum fee: <strong[^>]*>1\.000 HBD/);
  assert.match(response.text, /Welcome to the neighborhood\./);
  assert.match(response.text, /public and permanent on Hive/);
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

test('owner pages expose safe metadata merge, reward claim, and local-only decrypt controls', async () => {
  const owner = signedInApp();
  const settings = await request(owner.app)
    .get('/profile/etblink/settings')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(settings.text, /data-m4-action="profile"/);
  assert.match(settings.text, /value="1\.000 HBD"/);
  assert.match(settings.text, /spammer/);
  assert.match(settings.text, /preserves unrelated fields/);

  const wallet = await request(owner.app)
    .get('/profile/etblink/wallet')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(wallet.text, /data-m4-action="claim-rewards"/);
  assert.match(wallet.text, /latest non-zero balances/i);

  const inbox = await request(owner.app)
    .get('/profile/etblink/inbox')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(inbox.text, /data-inbox-ciphertext="#8fixtureciphertext"/);
  assert.match(inbox.text, /Decryption happens only through your local Keychain Memo key/);
  assert.doesNotMatch(inbox.text, /Welcome to the neighborhood|ordinary transfer/);
  assert.match(inbox.headers['cache-control'], /no-store/);
});

test('public connection tabs and controlled message forms are available without exposing owner pages', async () => {
  const signedIn = signedInApp('barfriend');
  const followers = await request(signedIn.app).get('/profile/etblink/followers').expect(200);
  assert.match(followers.text, /@etblink followers/);
  assert.match(followers.text, /barfriend/);

  const wall = await request(signedIn.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', signedIn.cookie)
    .expect(200);
  assert.match(wall.text, /data-m4-action="wall"/);
  assert.match(wall.text, /data-m4-action="inbox"/);
  assert.match(wall.text, /Hive-Bar receives only ciphertext/);
  assert.doesNotMatch(wall.text, /href="\/profile\/etblink\/settings"/);
});
