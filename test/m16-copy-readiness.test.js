'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';
const FORBIDDEN_VISIBLE_COPY = /individually authorized controlled-write run|Verified-owner page|Current on-chain state|M2 read-only release|account-bound action|exact Active operation|Controlled maximum|merchant author/i;

function signedInApp({ account = 'barfriend', writeMode = 'beta' } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: writeMode,
    HIVE_SIGNER_MODE: writeMode === 'beta' ? 'keychain' : 'disabled',
    HIVE_CONTROLLED_ACCOUNTS: writeMode === 'controlled' ? account : '',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
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

function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('M16.5 public pages speak to visitors rather than operators', async () => {
  const { app } = createFixtureApp();
  const routes = ['/', '/community', '/profile/etblink/wallet', '/profile/etblink/wall-posts', '/pay'];

  for (const route of routes) {
    const response = await request(app).get(route).expect(200);
    assert.doesNotMatch(visibleText(response.text), FORBIDDEN_VISIBLE_COPY, route);
  }

  const home = await request(app).get('/').expect(200);
  assert.match(home.text, /Anyone can browse; sign in with Hive Keychain when you want to participate/);
  assert.match(home.text, /Your private keys stay in Keychain/);

  const pay = await request(app).get('/pay').expect(200);
  assert.match(pay.text, /If confirmation is unclear, don’t pay again/);
  assert.match(pay.text, /Hive-Bar never receives your private keys/);
});

test('M16.5 beta participation copy stays friendly while preserving write-review safety', async () => {
  const beta = signedInApp();
  const community = await request(beta.app)
    .get('/community')
    .set('cookie', beta.cookie)
    .expect(200);
  assert.match(community.text, /Create a community post/);
  assert.match(community.text, /Separate tags with commas\. We’ll add the community tag for you/);
  assert.match(community.text, /Choose up or down, set the strength, then review the exact vote before Keychain opens/);
  assert.doesNotMatch(visibleText(community.text), FORBIDDEN_VISIBLE_COPY);

  const wall = await request(beta.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', beta.cookie)
    .expect(200);
  assert.match(wall.text, /Post a public message/);
  assert.match(wall.text, /Send a private message/);
  assert.match(wall.text, /Keychain encrypts the message in this browser/);
  assert.match(wall.text, /payment details are permanently visible on Hive/);
  assert.match(wall.text, /HBD amount, time, and transaction remain public on Hive/);
  assert.doesNotMatch(visibleText(wall.text), FORBIDDEN_VISIBLE_COPY);
});

test('M16.5 keeps technical transaction evidence available but secondary', async () => {
  const beta = signedInApp({ account: 'etblink' });
  const page = await request(beta.app)
    .get('/community')
    .set('cookie', beta.cookie)
    .expect(200);

  assert.match(page.text, /Review before signing/);
  assert.match(page.text, /<details class="mt-4">/);
  assert.match(page.text, /Technical details/);
  assert.match(page.text, /Operation fingerprint/);
  assert.match(page.text, /data-social-operations/);
  assert.match(page.text, /Continue to Keychain/);
});

test('M16.5 owner pages explain privacy and settings in ordinary language', async () => {
  const owner = signedInApp({ account: 'etblink', writeMode: 'controlled' });
  const settings = await request(owner.app)
    .get('/profile/etblink/settings')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(settings.text, /Your profile settings/);
  assert.match(settings.text, /unrelated settings from other apps stay intact/);
  assert.match(settings.text, /Hide messages from these accounts/);
  assert.doesNotMatch(visibleText(settings.text), FORBIDDEN_VISIBLE_COPY);

  const inbox = await request(owner.app)
    .get('/profile/etblink/inbox')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(inbox.text, /Your encrypted inbox/);
  assert.match(inbox.text, /decrypted message is not sent back to Hive-Bar/);
  assert.match(inbox.text, /Transaction details/);
  assert.doesNotMatch(visibleText(inbox.text), FORBIDDEN_VISIBLE_COPY);
});
