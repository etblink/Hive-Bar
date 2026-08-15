'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc, fixture } = require('./support/fixture-rpc');

const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';

function authenticatedApp(writeMode = 'controlled') {
  const baseRpc = createFixtureRpc();
  const rpcPool = {
    calls: baseRpc.calls,
    getStatus: baseRpc.getStatus,
    async call(api, method, params) {
      if (
        `${api}.${method}` === 'bridge.get_account_posts' &&
        params.account === 'fourthst.threads'
      ) {
        return [
          {
            ...structuredClone(fixture.communityPosts[0]),
            author: 'fourthst.threads',
            permlink: 'threads-2026-08-11',
            parent_author: '',
            parent_permlink: 'hive-108590',
          },
        ];
      }
      return baseRpc.call(api, method, params);
    },
  };
  const config = configFrom({
    HIVE_WRITE_MODE: writeMode,
    HIVE_CONTROLLED_ACCOUNTS: writeMode === 'controlled' ? 'etblink' : '',
    SESSION_SECRET,
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create('etblink');
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, cookie: `hive_bar_session=${token}` };
}

function postOnlyAuthenticatedApp() {
  const baseRpc = createFixtureRpc();
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'fourthstreetbar',
    HIVE_CONTROLLED_ACTIONS: 'post',
    SESSION_SECRET,
  });
  const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
  const { token } = sessionStore.create('fourthstreetbar');
  return { app: createApp({ config, logger, rpcPool: baseRpc, sessionStore }), cookie: `hive_bar_session=${token}` };
}

test('controlled authenticated pages expose all eight actions behind exact preflight review', async () => {
  const fixtureApp = authenticatedApp();
  const community = await request(fixtureApp.app)
    .get('/community')
    .set('cookie', fixtureApp.cookie)
    .expect(200);
  assert.match(community.text, /data-social-action="post"/);
  assert.match(community.text, /data-social-action="vote"/);
  assert.match(community.text, /data-social-action="subscribe"/);
  assert.match(community.text, /0 \/ 32,768 UTF-8 bytes/);
  assert.match(community.text, /Review exact Hive operation/);
  assert.match(community.text, /data-social-fingerprint/);
  assert.match(community.text, /@etblink/);
  assert.doesNotMatch(community.text, /name="(?:voter|follower)" value="etblink"/);

  const threads = await request(fixtureApp.app)
    .get('/community/threads')
    .set('cookie', fixtureApp.cookie)
    .expect(200);
  assert.match(threads.text, /data-social-action="thread"/);
  assert.match(threads.text, /0 \/ 500 UTF-8 bytes/);

  const post = await request(fixtureApp.app)
    .get('/post/etblink/welcome-fourth-street-bar')
    .set('cookie', fixtureApp.cookie)
    .expect(200);
  assert.match(post.text, /data-social-action="comment"/);
  assert.match(post.text, /data-social-action="vote"/);
  assert.match(post.text, /0 \/ 8,192 UTF-8 bytes/);

  const profile = await request(fixtureApp.app)
    .get('/profile/barfriend')
    .set('cookie', fixtureApp.cookie)
    .expect(200);
  assert.match(profile.text, /data-social-action="unfollow"/);
  assert.match(profile.text, /Current on-chain state: following/);
});

test('the same signed-in UI stays gated while write mode is disabled', async () => {
  const fixtureApp = authenticatedApp('disabled');
  const community = await request(fixtureApp.app)
    .get('/community')
    .set('cookie', fixtureApp.cookie)
    .expect(200);
  assert.doesNotMatch(community.text, /data-social-action=/);
  assert.match(community.text, /disabled until an individually authorized controlled-write run/);
});

test('the M9 post-only pilot exposes the post form with a disabled signer handoff', async () => {
  const fixtureApp = postOnlyAuthenticatedApp();
  const community = await request(fixtureApp.app)
    .get('/community')
    .set('cookie', fixtureApp.cookie)
    .expect(200);
  assert.match(community.text, /data-social-action="post" data-signer-mode="disabled"/);
  assert.doesNotMatch(community.text, /data-social-action="subscribe"/);
});
