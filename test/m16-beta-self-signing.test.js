'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { BETA_M16_4_ACTIONS } = require('../routes/m4');
const { BETA_M16_3_ACTIONS } = require('../routes/social');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';

function betaFixture({ account = 'barfriend' } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const rpcPool = createFixtureRpc();
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create(account);
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, config, rpcPool, session, token };
}

function authorized(builder, fixture) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .set('x-csrf-token', fixture.session.csrfToken);
}

test('beta mode remains Keychain-only while voting and messaging extensions stay explicitly bounded', () => {
  assert.throws(
    () => configFrom({ HIVE_WRITE_MODE: 'beta' }),
    /Beta self-signing mode requires Hive Keychain/,
  );

  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
  });
  assert.equal(config.hive.writeMode, 'beta');
  assert.equal(config.hive.betaSelfSigningEnabled, true);
  assert.deepEqual(config.hive.betaSelfActions, ['post', 'comment']);
  assert.deepEqual([...BETA_M16_3_ACTIONS], ['vote']);
  assert.deepEqual([...BETA_M16_4_ACTIONS], ['wall', 'inbox']);
  assert.equal(config.hive.writesEnabled, false);
  assert.deepEqual(config.hive.controlledAccounts, []);
  assert.equal(config.payments.enabled, false);
});

test('an arbitrary verified beta user can prepare only self-authored post and comment operations', async () => {
  const fixture = betaFixture();

  const post = await authorized(
    request(fixture.app).post('/api/social/preflight/post'),
    fixture,
  )
    .send({
      title: 'Beta self-signing post',
      body: 'Prepared by the verified session account.',
      tags: ['reno'],
      author: 'etblink',
    })
    .expect(201);

  assert.equal(post.body.broadcastMode, 'beta-self');
  assert.equal(post.body.account, 'barfriend');
  assert.equal(post.body.signer, 'barfriend');
  assert.equal(post.body.authority, 'Posting');
  assert.equal(post.body.operations[0][0], 'comment');
  assert.equal(post.body.operations[0][1].author, 'barfriend');
  assert.equal(post.body.operations[0][1].parent_author, '');
  assert.equal(post.body.operations[0][1].parent_permlink, 'hive-108590');

  const comment = await authorized(
    request(fixture.app).post('/api/social/preflight/comment'),
    fixture,
  )
    .send({
      body: 'Replying as the verified beta account.',
      parentAuthor: 'etblink',
      parentPermlink: 'welcome-fourth-street-bar',
      author: 'etblink',
    })
    .expect(201);

  assert.equal(comment.body.broadcastMode, 'beta-self');
  assert.equal(comment.body.account, 'barfriend');
  assert.equal(comment.body.signer, 'barfriend');
  assert.equal(comment.body.operations[0][1].author, 'barfriend');
  assert.equal(comment.body.operations[0][1].parent_author, 'etblink');
  assert.equal(comment.body.operations[0][1].parent_permlink, 'welcome-fourth-street-bar');
});

test('M16.3 prepares explicit weighted upvotes and downvotes as the verified beta voter', async () => {
  const fixture = betaFixture();

  const upvote = await authorized(
    request(fixture.app).post('/api/social/preflight/vote'),
    fixture,
  )
    .send({
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      voter: 'attacker',
      direction: 'upvote',
      percent: 42,
    })
    .expect(201);

  assert.equal(upvote.body.broadcastMode, 'beta-self');
  assert.equal(upvote.body.account, 'barfriend');
  assert.equal(upvote.body.signer, 'barfriend');
  assert.equal(upvote.body.authority, 'Posting');
  assert.deepEqual(upvote.body.operations, [
    ['vote', {
      voter: 'barfriend',
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      weight: 4200,
    }],
  ]);
  assert.equal(upvote.body.summary.kind, 'Upvote');
  assert.equal(upvote.body.summary.direction, 'upvote');
  assert.equal(upvote.body.summary.percent, 42);
  assert.equal(upvote.body.summary.weight, 4200);

  await authorized(
    request(fixture.app).post(`/api/social/preflight/${upvote.body.id}/cancel`),
    fixture,
  ).expect(204);

  const downvote = await authorized(
    request(fixture.app).post('/api/social/preflight/vote'),
    fixture,
  )
    .send({
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      direction: 'downvote',
      percent: 37,
    })
    .expect(201);

  assert.deepEqual(downvote.body.operations, [
    ['vote', {
      voter: 'barfriend',
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      weight: -3700,
    }],
  ]);
  assert.equal(downvote.body.summary.kind, 'Downvote');
  assert.equal(downvote.body.summary.direction, 'downvote');
  assert.equal(downvote.body.summary.percent, 37);
  assert.equal(downvote.body.summary.weight, -3700);

  await authorized(
    request(fixture.app).post(`/api/social/preflight/${downvote.body.id}/cancel`),
    fixture,
  ).expect(204);

  await authorized(
    request(fixture.app).post('/api/social/preflight/vote'),
    fixture,
  )
    .send({
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      direction: 'sideways',
      percent: 50,
    })
    .expect(400)
    .expect(({ body }) => assert.equal(body.error.code, 'VALIDATION_ERROR'));
});

test('M16.4 enables only session-bound wall and encrypted inbox Active transfers', async () => {
  const fixture = betaFixture();

  const wall = await authorized(
    request(fixture.app).post('/api/m4/preflight/wall'),
    fixture,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      message: 'Welcome to the neighborhood.',
      from: 'attacker',
    })
    .expect(201);

  assert.equal(wall.body.broadcastMode, 'beta-self');
  assert.equal(wall.body.account, 'barfriend');
  assert.equal(wall.body.authority, 'Active');
  assert.deepEqual(wall.body.operations, [[
    'transfer',
    {
      from: 'barfriend',
      to: 'etblink',
      amount: '1.000 HBD',
      memo: 'hivebar-wall:v1:Welcome to the neighborhood.',
    },
  ]]);

  await authorized(
    request(fixture.app).post(`/api/m4/preflight/${wall.body.id}/accepted`),
    fixture,
  )
    .send({ transactionId: '1'.repeat(40) })
    .expect(200);

  const observed = await authorized(
    request(fixture.app).post(`/api/m4/preflight/${wall.body.id}/observe`),
    fixture,
  ).expect(200);
  assert.equal(observed.body.state, 'observed');
  assert.equal(observed.body.blockNumber, 108944500);

  const inbox = await authorized(
    request(fixture.app).post('/api/m4/preflight/inbox'),
    fixture,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      ciphertext: '#8fixtureciphertext',
      from: 'attacker',
    })
    .expect(201);

  assert.equal(inbox.body.broadcastMode, 'beta-self');
  assert.equal(inbox.body.account, 'barfriend');
  assert.equal(inbox.body.authority, 'Active');
  assert.deepEqual(inbox.body.operations, [[
    'transfer',
    {
      from: 'barfriend',
      to: 'etblink',
      amount: '1.000 HBD',
      memo: 'hivebar-inbox:v1:#8fixtureciphertext',
    },
  ]]);
  assert.doesNotMatch(JSON.stringify(inbox.body.summary), /#8fixtureciphertext/);

  await authorized(
    request(fixture.app).post(`/api/m4/preflight/${inbox.body.id}/cancel`),
    fixture,
  ).expect(204);

  const staleFee = await authorized(
    request(fixture.app).post('/api/m4/preflight/wall'),
    fixture,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '2.000 HBD',
      amount: '2.000 HBD',
      message: 'Stale fee must not pass.',
    })
    .expect(409);
  assert.equal(staleFee.body.error.code, 'WALL_FEE_CHANGED');

  await authorized(
    request(fixture.app).post('/api/m4/preflight/profile'),
    fixture,
  )
    .send({})
    .expect(503)
    .expect(({ body }) => assert.equal(body.error.code, 'BETA_ACTION_NOT_ALLOWED'));

  await authorized(
    request(fixture.app).post('/api/m4/preflight/claim-rewards'),
    fixture,
  )
    .send({})
    .expect(503)
    .expect(({ body }) => assert.equal(body.error.code, 'BETA_ACTION_NOT_ALLOWED'));
});

test('beta UI exposes posts, replies, weighted voting, and M16.4 messaging without opening other writes', async () => {
  const fixture = betaFixture({ account: 'etblink' });

  const community = await request(fixture.app)
    .get('/community')
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .expect(200);
  assert.match(community.text, /data-social-action="post" data-signer-mode="keychain"/);
  assert.match(community.text, /data-social-action="vote"\s+data-signer-mode="keychain"/);
  assert.match(community.text, /name="direction"/);
  assert.match(community.text, /value="upvote">Upvote/);
  assert.match(community.text, /value="downvote">Downvote/);
  assert.match(community.text, /name="percent"/);
  assert.doesNotMatch(community.text, /data-social-action="subscribe"/);

  const post = await request(fixture.app)
    .get('/post/etblink/welcome-fourth-street-bar')
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .expect(200);
  const replyForms = post.text.match(/data-social-action="comment" data-signer-mode="keychain"/g) || [];
  assert.equal(replyForms.length, 2);
  assert.match(post.text, /Reply to @barfriend/);
  assert.match(post.text, /name="parentAuthor" value="barfriend"/);
  assert.match(post.text, /name="parentPermlink" value="re-welcome-fourth-street-bar"/);
  const voteForms = post.text.match(/data-social-action="vote"\s+data-signer-mode="keychain"/g) || [];
  assert.equal(voteForms.length, 2);
  assert.match(post.text, /Choose Upvote or Downvote and a whole-number weight from 1% to 100%/);

  const messenger = betaFixture({ account: 'barfriend' });
  const wall = await request(messenger.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', `hive_bar_session=${messenger.token}`)
    .expect(200);
  assert.match(wall.text, /data-m4-action="wall"/);
  assert.match(wall.text, /data-m4-action="inbox"/);
  assert.match(wall.text, /Hive-Bar receives only ciphertext/);
  assert.match(wall.text, /exact Active operation will be reviewed before signing/);
  assert.doesNotMatch(wall.text, /individually authorized controlled-write run/);
});
