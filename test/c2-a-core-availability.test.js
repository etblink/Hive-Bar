'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { BETA_ACTIONS } = require('../src/beta/actions');
const { metadataRevision } = require('../src/hive/profile-settings');
const { V1_ACTIONS } = require('../src/v1/actions');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc, fixture } = require('./support/fixture-rpc');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://fourthstreetbar.com';
const SESSION_SECRET = 'c2-a-core-availability-session-secret-that-is-at-least-32-bytes';
const EXPECTED_BETA_ACTIONS = [
  'post',
  'comment',
  'vote',
  'follow',
  'unfollow',
  'subscribe',
  'unsubscribe',
  'profile',
  'claim-rewards',
  'wall',
  'inbox',
  'thread',
];

function c2aFixture(account = 'etblink') {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    APP_ORIGIN: ORIGIN,
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create(account);
  const rpcPool = createFixtureRpc();
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, config, session, token };
}

function authorized(builder, fixtureApp) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .set('x-csrf-token', fixtureApp.session.csrfToken);
}

function documentFor(html, url = `${ORIGIN}/`) {
  return new JSDOM(html, { url }).window.document;
}

test('C2-A exposes only the reviewed profile action in beta and keeps V1/payment boundaries inactive', async () => {
  const fixtureApp = c2aFixture();
  assert.deepEqual(BETA_ACTIONS, EXPECTED_BETA_ACTIONS);
  assert.equal(fixtureApp.app.locals.canWriteAction('profile'), true);
  assert.equal(fixtureApp.config.hive.betaSelfSigningEnabled, true);
  assert.equal(fixtureApp.config.hive.v1SelfSigningEnabled, false);
  assert.equal(fixtureApp.config.payments.enabled, false);
  assert.equal(fixtureApp.config.distriator.enabled, false);
  assert.equal(V1_ACTIONS.length, 12);

  const current = fixture.accounts.find((item) => item.name === 'etblink');
  const prepared = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/profile'),
    fixtureApp,
  )
    .send({
      baseRevision: metadataRevision(current.posting_json_metadata),
      displayName: 'Evan C2-A',
      about: 'Profile updates are available in beta.',
      profileImage: 'https://images.hive.blog/u/etblink/avatar',
      wallFee: '1.000 HBD',
      blocklist: 'spammer',
    })
    .expect(201);

  assert.equal(prepared.body.broadcastMode, 'beta-self');
  assert.equal(prepared.body.account, 'etblink');
  assert.equal(prepared.body.signer, 'etblink');
  assert.equal(prepared.body.authority, 'Posting');
  assert.equal(prepared.body.operations.length, 1);
  assert.equal(prepared.body.operations[0][0], 'account_update2');
  assert.equal(prepared.body.operations[0][1].account, 'etblink');
  assert.equal(prepared.body.operations[0][1].json_metadata, '');
  assert.match(prepared.body.fingerprint, /^[0-9a-f]{64}$/);

  await authorized(
    request(fixtureApp.app).post(`/api/m4/preflight/${prepared.body.id}/cancel`),
    fixtureApp,
  ).expect(204);
});

test('C2-A profile settings use the shared byte-counter contract and keep connection routes without duplicate tabs', async () => {
  const fixtureApp = c2aFixture();
  const settingsResponse = await request(fixtureApp.app)
    .get('/profile/etblink/settings')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  const settings = documentFor(settingsResponse.text, `${ORIGIN}/profile/etblink/settings`);
  const about = settings.querySelector('#profile-about');
  assert.ok(about);
  assert.equal(about.hasAttribute('data-composer-input'), true);
  assert.equal(about.dataset.maxBytes, '512');
  assert.ok(about.closest('[data-composer-field]')?.querySelector('[data-byte-counter]'));
  assert.equal(about.closest('form')?.dataset.composerForm, 'profile-settings');
  assert.match(settingsResponse.text, />Review changes</);

  const tabs = Array.from(settings.querySelectorAll('.profile-tabs a'), (link) => link.textContent.trim());
  assert.equal(tabs.includes('Followers'), false);
  assert.equal(tabs.includes('Following'), false);
  assert.ok(settings.querySelector('.profile-hero__stats a[href="/profile/etblink/followers"]'));
  assert.ok(settings.querySelector('.profile-hero__stats a[href="/profile/etblink/following"]'));

  await request(fixtureApp.app)
    .get('/profile/etblink/followers')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  await request(fixtureApp.app)
    .get('/profile/etblink/following')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);

  const composerSource = fs.readFileSync(path.join(ROOT, 'public/js/composer-presentation.js'), 'utf8');
  assert.match(composerSource, /htmx:afterSwap/);
  assert.match(composerSource, /function initialize\(/);
});

test('C2-A removes the redundant website loop and provides verified Keychain acquisition choices without activating onboarding', async () => {
  const fixtureApp = c2aFixture();
  const home = await request(fixtureApp.app).get('/').expect(200);
  const homeDocument = documentFor(home.text);
  const visit = homeDocument.querySelector('#visit');
  assert.ok(visit?.querySelector('a[href^="https://www.google.com/maps/"]'));
  assert.equal(visit?.querySelector('a[href="https://4thstreetbarreno.com/"]'), null);
  assert.doesNotMatch(visit?.textContent || '', /Official bar website/i);

  const onboarding = await request(fixtureApp.app).get('/create-account').expect(200);
  const onboardingDocument = documentFor(onboarding.text, `${ORIGIN}/create-account`);
  const links = Array.from(onboardingDocument.querySelectorAll('#keychain-acquisition-heading ~ * a, [aria-labelledby="keychain-acquisition-heading"] a'));
  const hrefs = Array.from(onboardingDocument.querySelectorAll('a'), (link) => link.href);
  assert.ok(hrefs.includes('https://chromewebstore.google.com/detail/hive-keychain/jcacnejopjdphbnjgfaaobbfafkihpep'));
  assert.ok(hrefs.includes('https://apps.apple.com/us/app/hive-keychain/id1552190010'));
  assert.ok(hrefs.includes('https://play.google.com/store/apps/details?id=com.mobilekeychain'));
  assert.equal(fixtureApp.config.onboarding?.active || false, false);
  assert.match(onboarding.text, /In-person account creation isn’t active yet/);
  assert.ok(links.length >= 3);
});

test('C2-A adds native Share with Copy-link fallback and exact per-post canonical/social metadata', async () => {
  const fixtureApp = c2aFixture();
  const response = await request(fixtureApp.app)
    .get('/post/etblink/welcome-fourth-street-bar')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  const document = documentFor(response.text, `${ORIGIN}/post/etblink/welcome-fourth-street-bar`);
  const share = document.querySelector('.conversation-post [data-share-post]');
  assert.ok(share);
  assert.equal(share.dataset.shareUrl, '/post/etblink/welcome-fourth-street-bar');
  assert.equal(share.getAttribute('aria-label'), 'Share post');
  assert.equal(share.hasAttribute('data-share-title'), false);
  assert.equal(
    document.querySelector('link[rel="canonical"]')?.href,
    `${ORIGIN}/post/etblink/welcome-fourth-street-bar`,
  );
  assert.equal(document.querySelector('meta[property="og:type"]')?.content, 'article');
  assert.equal(
    document.querySelector('meta[property="og:url"]')?.content,
    `${ORIGIN}/post/etblink/welcome-fourth-street-bar`,
  );
  assert.equal(
    document.querySelector('meta[property="og:title"]')?.content,
    'Welcome to the 4th Street Bar community',
  );
  assert.ok(document.querySelector('meta[name="twitter:card"]'));

  const community = await request(fixtureApp.app)
    .get('/community')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  assert.ok(documentFor(community.text, `${ORIGIN}/community`).querySelectorAll('[data-share-post]').length > 0);

  const script = fs.readFileSync(path.join(ROOT, 'public/js/share-presentation.js'), 'utf8');
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|requestBroadcast|broadcast_transaction/);

  const nativeDom = new JSDOM(
    '<article><h2 class="social-post__title">Welcome</h2><button data-share-post data-share-url="/post/etblink/welcome-fourth-street-bar">Share</button></article>',
    { runScripts: 'outside-only', url: `${ORIGIN}/community` },
  );
  let nativePayload = null;
  Object.defineProperty(nativeDom.window.navigator, 'share', {
    configurable: true,
    value: async (payload) => { nativePayload = payload; },
  });
  nativeDom.window.eval(script);
  const nativeResult = await nativeDom.window.HiveBarShare.sharePost(
    nativeDom.window.document.querySelector('button'),
  );
  assert.equal(nativeResult.method, 'native');
  assert.equal(nativePayload.title, 'Welcome');
  assert.equal(nativePayload.url, `${ORIGIN}/post/etblink/welcome-fourth-street-bar`);
  nativeDom.window.close();

  const copyDom = new JSDOM(
    '<button data-share-post data-share-url="/post/barfriend/a-post">Share</button>',
    { runScripts: 'outside-only', url: `${ORIGIN}/community` },
  );
  let copied = null;
  Object.defineProperty(copyDom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value) => { copied = value; } },
  });
  copyDom.window.eval(script);
  const copyResult = await copyDom.window.HiveBarShare.sharePost(
    copyDom.window.document.querySelector('button'),
  );
  assert.equal(copyResult.method, 'clipboard');
  assert.equal(copied, `${ORIGIN}/post/barfriend/a-post`);
  copyDom.window.close();
});
