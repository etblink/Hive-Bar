'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const axe = require('axe-core');
const { HtmlValidate } = require('html-validate');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, logger } = require('./support/test-app');
const { createUx1aRpc } = require('./support/ux-1a-fixture');

const SESSION_SECRET = 'ux-1a-session-secret-that-is-at-least-32-bytes';

function ux1aFixture({ populated = false } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    RATE_LIMIT_MAX: '1000',
    SESSION_SECRET,
  });
  const rpcPool = createUx1aRpc({ populated });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create('etblink');
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, cookie: `hive_bar_session=${token}`, rpcPool };
}

function accessibilityMessages(report) {
  return report.results
    .flatMap((result) => result.messages)
    .map((message) => `${message.ruleId}: ${message.message}`)
    .join('\n');
}

test('UX-1A community browse suppresses only the active container across full and HTMX results', async () => {
  const current = ux1aFixture();
  const responses = [
    await request(current.app).get('/community').set('cookie', current.cookie).expect(200),
    await request(current.app)
      .get('/community/hive-108590/community-posts?sort=created')
      .set('HX-Request', 'true')
      .set('cookie', current.cookie)
      .expect(200),
  ];

  for (const response of responses) {
    assert.match(response.text, /Ordinary community post remains visible/);
    assert.match(response.text, /Legitimate update from the Threads account/);
    assert.doesNotMatch(response.text, /Technical Threads Container — Do Not Display/);
  }
  assert.match(responses[0].text, /About this community/);
  assert.match(responses[0].text, /data-social-action="(?:subscribe|unsubscribe)"/);
  const rankedCalls = current.rpcPool.calls.filter(({ method }) => method === 'get_ranked_posts');
  assert.equal(rankedCalls.length, 2);
  assert.ok(rankedCalls.every(({ params }) => params.limit === 12));
});

test('UX-1A empty Threads state exposes an accessible beta composer only to a signed-in user', async () => {
  const current = ux1aFixture();
  const signedIn = await request(current.app)
    .get('/community/threads')
    .set('cookie', current.cookie)
    .expect(200);
  const signedOut = await request(current.app).get('/community/threads').expect(200);

  assert.match(signedIn.text, /Start a Thread/);
  assert.match(signedIn.text, /What do you want to share\?/);
  assert.match(signedIn.text, /placeholder="What’s happening\?"/);
  assert.match(
    signedIn.text,
    /data-social-action="thread" data-signer-mode="keychain"/,
  );
  assert.match(signedIn.text, /No threads yet/);
  assert.doesNotMatch(signedIn.text, /View the parent post|Technical Threads Container/);
  assert.doesNotMatch(signedOut.text, /data-social-action="thread"/);

  const validator = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: { 'no-trailing-whitespace': 'off' },
  });
  const report = await validator.validateString(signedIn.text);
  assert.equal(report.valid, true, accessibilityMessages(report));

  const dom = new JSDOM(signedIn.text, {
    runScripts: 'outside-only',
    url: 'https://hive-bar.test/community/threads',
  });
  const threadInput = dom.window.document.querySelector('#new-thread-body');
  const byteCounter = dom.window.document.querySelector('#new-thread-counter');
  assert.ok(threadInput.parentElement.contains(byteCounter));
  dom.window.eval(axe.source);
  const axeResult = await dom.window.axe.run(dom.window.document, {
    resultTypes: ['violations'],
    rules: { 'color-contrast': { enabled: false } },
  });
  const blocking = axeResult.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact),
  );
  dom.window.close();
  assert.deepEqual(Array.from(blocking, (violation) => violation.id), []);
});

test('UX-1A populated Threads render as social content while the container remains internal', async () => {
  const current = ux1aFixture({ populated: true });
  const response = await request(current.app)
    .get('/community/threads')
    .set('cookie', current.cookie)
    .expect(200);

  assert.match(response.text, /Who is stopping by the bar tonight\?/);
  assert.match(response.text, /I will be there after work\./);
  assert.match(response.text, /role="feed" aria-label="Community Threads"/);
  assert.match(response.text, /data-social-action="thread" data-signer-mode="keychain"/);
  assert.doesNotMatch(response.text, /View the parent post|Technical Threads Container/);

  const internal = await request(current.app)
    .get('/community/api/latest-thread-container')
    .expect(200);
  assert.equal(internal.body.author, 'fourthst.threads');
  assert.equal(internal.body.permlink, 'threads-2026-08-20');
});
