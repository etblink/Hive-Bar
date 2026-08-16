'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
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

test('beta mode is explicit, Keychain-only, and does not open controlled or payment gates', () => {
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

test('beta self-signing rejects voting and all M4 Active-authority paths in M16.2', async () => {
  const fixture = betaFixture();

  const vote = await authorized(
    request(fixture.app).post('/api/social/preflight/vote'),
    fixture,
  )
    .send({ author: 'etblink', permlink: 'welcome-fourth-street-bar', percent: 100 })
    .expect(503);
  assert.equal(vote.body.error.code, 'BETA_ACTION_NOT_ALLOWED');

  const wall = await authorized(
    request(fixture.app).post('/api/m4/preflight/wall'),
    fixture,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      message: 'This must stay closed in M16.2.',
    })
    .expect(503);
  assert.equal(wall.body.error.code, 'FEATURE_UNAVAILABLE');
});

test('beta UI exposes post, top-level reply, and reply-to-comment while other social writes stay closed', async () => {
  const fixture = betaFixture({ account: 'etblink' });

  const community = await request(fixture.app)
    .get('/community')
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .expect(200);
  assert.match(community.text, /data-social-action="post" data-signer-mode="keychain"/);
  assert.doesNotMatch(community.text, /data-social-action="vote"/);
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
  assert.doesNotMatch(post.text, /data-social-action="vote"/);
});
