'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
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

test('beta mode remains Keychain-only while M16.3 adds only the vote extension', () => {
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

test('M16.3 does not open M4 Active-authority paths', async () => {
  const fixture = betaFixture();

  const wall = await authorized(
    request(fixture.app).post('/api/m4/preflight/wall'),
    fixture,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      message: 'This must stay closed in M16.3.',
    })
    .expect(503);
  assert.equal(wall.body.error.code, 'FEATURE_UNAVAILABLE');
});

test('beta UI exposes post, replies, and explicit weighted voting while other social writes stay closed', async () => {
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
});
