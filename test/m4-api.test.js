'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { metadataRevision } = require('../src/hive/profile-settings');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc, fixture } = require('./support/fixture-rpc');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';

function controlledApp(account = 'etblink', overrides = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: account,
    HIVE_GLOBAL_WALL_EXCLUSIONS: 'rewardbot',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
    ...overrides,
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create(account);
  const rpcPool = createFixtureRpc();
  return {
    app: createApp({ config, logger, rpcPool, sessionStore }),
    config,
    rpcPool,
    session,
    token,
  };
}

function authorized(builder, fixtureApp) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .set('x-csrf-token', fixtureApp.session.csrfToken);
}

test('preflights a stale-safe profile merge with an exact inspectable diff', async () => {
  const fixtureApp = controlledApp();
  const account = fixture.accounts.find((item) => item.name === 'etblink');
  const response = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/profile'),
    fixtureApp,
  )
    .send({
      baseRevision: metadataRevision(account.posting_json_metadata),
      displayName: 'Evan Updated',
      about: 'Still building.',
      profileImage: 'https://images.hive.blog/u/etblink/avatar',
      wallFee: '1.000 HBD',
      blocklist: 'spammer\nrewardbot',
    })
    .expect(201);

  assert.equal(response.body.account, 'etblink');
  assert.equal(response.body.authority, 'Posting');
  assert.equal(response.body.operations[0][0], 'account_update2');
  assert.equal(response.body.operations[0][1].json_metadata, '');
  const merged = JSON.parse(response.body.operations[0][1].posting_json_metadata);
  assert.equal(merged.profile.location, 'Reno');
  assert.deepEqual(merged.other_client, { keep: true });
  assert.deepEqual(merged.hivebar.wall_blocklist, ['spammer', 'rewardbot']);
  assert.equal(response.body.summary.exactDiff.displayName.after, 'Evan Updated');

  const stale = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/profile'),
    fixtureApp,
  )
    .send({
      baseRevision: '0'.repeat(64),
      displayName: 'Wrong revision',
      about: '',
      profileImage: '',
      wallFee: '1.000 HBD',
      blocklist: '',
    })
    .expect(409);
  assert.equal(stale.body.error.code, 'PROFILE_METADATA_STALE');
});

test('preflights exact current reward balances and rejects client-supplied balance substitution', async () => {
  const fixtureApp = controlledApp();
  const response = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/claim-rewards'),
    fixtureApp,
  )
    .send({ reward_hive: '999999.000 HIVE' })
    .expect(201);
  assert.deepEqual(response.body.operations, [[
    'claim_reward_balance',
    {
      account: 'etblink',
      reward_hive: '1.000 HIVE',
      reward_hbd: '0.500 HBD',
      reward_vests: '1000.000000 VESTS',
    },
  ]]);
});

test('revalidates the current fee and observes the exact Active wall transaction', async () => {
  const fixtureApp = controlledApp('barfriend');
  const preflight = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/wall'),
    fixtureApp,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      message: 'Welcome to the neighborhood.',
    })
    .expect(201);
  assert.equal(preflight.body.authority, 'Active');
  assert.deepEqual(preflight.body.operations, [[
    'transfer',
    {
      from: 'barfriend',
      to: 'etblink',
      amount: '1.000 HBD',
      memo: 'hivebar-wall:v1:Welcome to the neighborhood.',
    },
  ]]);

  await authorized(
    request(fixtureApp.app).post(`/api/m4/preflight/${preflight.body.id}/accepted`),
    fixtureApp,
  )
    .send({ transactionId: '1'.repeat(40) })
    .expect(200);
  const observed = await authorized(
    request(fixtureApp.app).post(`/api/m4/preflight/${preflight.body.id}/observe`),
    fixtureApp,
  ).expect(200);
  assert.equal(observed.body.state, 'observed');
  assert.equal(observed.body.blockNumber, 108944500);

  const changed = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/wall'),
    fixtureApp,
  )
    .send({ recipient: 'etblink', expectedFee: '2.000 HBD', message: 'Stale fee' })
    .expect(409);
  assert.equal(changed.body.error.code, 'WALL_FEE_CHANGED');
});

test('accepts only ciphertext for inbox preflight and never requires plaintext', async () => {
  const fixtureApp = controlledApp('barfriend');
  const response = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/inbox'),
    fixtureApp,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      ciphertext: '#8ciphertextonly',
    })
    .expect(201);
  assert.equal(response.body.authority, 'Active');
  assert.equal(response.body.operations[0][1].memo, 'hivebar-inbox:v1:#8ciphertextonly');
  assert.doesNotMatch(JSON.stringify(response.body.summary), /#8ciphertextonly/);

  const plaintext = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/inbox'),
    fixtureApp,
  )
    .send({ recipient: 'etblink', expectedFee: '1.000 HBD', ciphertext: 'secret plaintext' })
    .expect(400);
  assert.equal(plaintext.body.error.code, 'VALIDATION_ERROR');
});

test('applies global sender exclusions and the complete write authorization boundary', async () => {
  const excluded = controlledApp('rewardbot');
  const blocked = await authorized(
    request(excluded.app).post('/api/m4/preflight/wall'),
    excluded,
  )
    .send({ recipient: 'etblink', expectedFee: '1.000 HBD', message: 'Service noise' })
    .expect(409);
  assert.equal(blocked.body.error.code, 'WALL_SENDER_EXCLUDED');

  const fixtureApp = controlledApp();
  await request(fixtureApp.app)
    .post('/api/m4/preflight/claim-rewards')
    .set('origin', ORIGIN)
    .send({})
    .expect(401)
    .expect(({ body }) => assert.equal(body.error.code, 'SESSION_REQUIRED'));
  await request(fixtureApp.app)
    .post('/api/m4/preflight/claim-rewards')
    .set('origin', 'https://attacker.example')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .set('x-csrf-token', fixtureApp.session.csrfToken)
    .send({})
    .expect(403)
    .expect(({ body }) => assert.equal(body.error.code, 'ORIGIN_NOT_ALLOWED'));
});
