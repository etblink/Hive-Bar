'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const ROOT = path.join(__dirname, '..');
const SESSION_SECRET = 'm19-copy-readiness-session-secret-at-least-32-bytes';
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function signedInOwnerApp() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_SIGNER_MODE: 'disabled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create('etblink');
  return {
    app: createApp({ config, logger, rpcPool: createFixtureRpc(), sessionStore }),
    cookie: `hive_bar_session=${token}`,
  };
}

test('M19.1 explains participation and Keychain sign-in before a patron acts', async () => {
  const { app } = createFixtureApp();
  const home = await request(app).get('/').expect(200);

  assert.match(home.text, /Anyone can browse; sign in with Hive Keychain when you want to participate/);
  assert.match(home.text, /Once signed in, you can post, vote, write on a Wall, and send encrypted private messages/);
  assert.match(home.text, /You’ll review each Hive action here before Keychain asks you to approve it/);
  assert.match(home.text, /signing a login message\. This does not send a transaction\. Never enter a private key here\./);
});

test('M19.1 states the encrypted-message and public-settings boundaries accurately', async () => {
  const owner = signedInOwnerApp();

  const inbox = await request(owner.app)
    .get('/profile/etblink/inbox')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(inbox.text, /Messages are stored on Hive as encrypted text/);
  assert.match(inbox.text, /Memo key locally in this browser/);
  assert.match(inbox.text, /decrypted message is not sent back to Hive-Bar/);
  assert.doesNotMatch(inbox.text, /Message text is encrypted on Hive/);

  const settings = await request(owner.app)
    .get('/profile/etblink/settings')
    .set('cookie', owner.cookie)
    .expect(200);
  assert.match(settings.text, /saved in public Hive profile metadata/);
  assert.match(settings.text, /minimum message fee and the list of accounts whose messages you hide/);
  assert.match(settings.text, /unrelated settings from other apps stay intact/);
  assert.match(settings.text, /This list is stored in public Hive metadata/);
});

test('M19.1 presents an ordinary-language 404 without exposing route implementation details', async () => {
  const { app } = createFixtureApp();
  const missing = await request(app).get('/m19-1-missing-page').expect(404);

  assert.match(missing.text, /Page not found/);
  assert.match(missing.text, /We couldn’t find that page\. Check the address or return to the community\./);
  assert.doesNotMatch(missing.text, /No route matches|GET \/m19-1-missing-page/);
});

test('M19.1 living governance advances source truth without changing production truth', () => {
  for (const relative of ['README.md', 'docs/README.md', 'docs/ROADMAP.md', 'docs/PRODUCTION_OPERATIONS.md']) {
    const content = read(relative);
    assert.match(content, /1aaef44c5b300810841f89044cf302aab789caf5/);
    assert.match(content, /ece4e565a514f01879761f2d5467dc7cc5323773/);
    assert.match(content, /M17\.3/);
  }

  const roadmap = read('docs/ROADMAP.md');
  assert.match(roadmap, /### M18\.4 — Beta-readiness closure[\s\S]*?\*\*Accepted in source\.\*\*/);
  assert.match(roadmap, /### M19\.1 — Copy and onboarding readiness[\s\S]*?\*\*Current\.\*\*/);
  assert.match(roadmap, /### M19\.2 — Controlled beta deployment[\s\S]*?\*\*Planned\.\*\*/);
  assert.match(roadmap, /Do not repeat the already established full transaction demonstration solely for ceremony/);

  const milestone = read('docs/M19_1_COPY_AND_ONBOARDING_READINESS.md');
  assert.match(milestone, /M19\.1 is source-only/);
  assert.match(milestone, /must not expand capabilities/);
  assert.match(milestone, /Acceptance of M19\.1 authorizes no deployment/);
});
