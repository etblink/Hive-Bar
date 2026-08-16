'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { createFixtureRpc } = require('./support/fixture-rpc');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');
const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';
const PUBLIC_ROUTES = [
  '/',
  '/community',
  '/community/threads',
  '/post/etblink/welcome-fourth-street-bar',
  '/profile/etblink',
  '/profile/etblink/wallet',
  '/profile/etblink/wall-posts',
  '/profile/etblink/followers',
  '/profile/etblink/following',
  '/pay',
];
const REVIEW_WIDTHS = [320, 360, 390, 768, 1024, 1440];

function verifiedApp(overrides = {}) {
  const config = configFrom({
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
    ...overrides,
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

function documentFor(html) {
  return new JSDOM(html).window.document;
}

test('M15.5 public surfaces remain complete local-first application documents', async () => {
  for (const route of PUBLIC_ROUTES) {
    const { app } = createFixtureApp();
    const response = await request(app).get(route).expect(200);
    const document = documentFor(response.text);

    assert.equal(
      document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
      'width=device-width, initial-scale=1',
      route,
    );
    assert.equal(document.querySelectorAll('main#main-content').length, 1, route);
    assert.equal(document.querySelector('a.skip-link')?.getAttribute('href'), '#main-content', route);
    assert.ok(document.querySelector('nav.app-primary-nav[aria-label="Primary navigation"]'), route);
    assert.equal(document.querySelectorAll('script:not([src])').length, 0, route);

    for (const stylesheet of document.querySelectorAll('link[rel="stylesheet"][href]')) {
      assert.match(stylesheet.getAttribute('href'), /^\/css\//, `${route}: stylesheet must be local`);
    }
    for (const script of document.querySelectorAll('script[src]')) {
      assert.match(script.getAttribute('src'), /^\//, `${route}: runtime script must be local`);
    }

    document.defaultView?.close();
  }
});

test('M15.5 signed-out, read-only, controlled, owner-only, and payment-enabled states stay truthful', async () => {
  const { app: publicApp } = createFixtureApp();
  const signedOutPay = await request(publicApp).get('/pay').expect(200);
  assert.match(signedOutPay.text, /Sign in to pay/);
  assert.doesNotMatch(signedOutPay.text, /data-pay-form/);

  const signedOutDocument = documentFor(signedOutPay.text);
  const signedOutPayNav = signedOutDocument.querySelector('.app-nav-link[data-pay-nav]');
  assert.ok(signedOutPayNav);
  assert.equal(signedOutPayNav.tagName, 'SPAN');
  assert.equal(signedOutPayNav.getAttribute('aria-disabled'), 'true');
  assert.equal(signedOutDocument.querySelector('a.app-nav-link[href="/pay"]'), null);
  signedOutDocument.defaultView?.close();

  const disabled = verifiedApp({ HIVE_WRITE_MODE: 'disabled' });
  const disabledProfile = await request(disabled.app)
    .get('/profile/etblink')
    .set('cookie', disabled.cookie)
    .expect(200);
  assert.match(disabledProfile.text, /Signed in with Hive Keychain/);
  assert.match(disabledProfile.text, /href="\/profile\/etblink"[^>]*class="app-nav-link app-nav-link--active"/);
  assert.match(disabledProfile.text, /href="\/pay"[^>]*data-pay-nav/);
  assert.doesNotMatch(disabledProfile.text, /data-social-action="post"/);

  const controlled = verifiedApp({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
  });
  const wallet = await request(controlled.app)
    .get('/profile/etblink/wallet')
    .set('cookie', controlled.cookie)
    .expect(200);
  assert.match(wallet.text, /data-m4-action="claim-rewards"/);

  await request(controlled.app)
    .get('/profile/etblink/inbox')
    .set('cookie', controlled.cookie)
    .expect(200);
  await request(controlled.app)
    .get('/profile/etblink/settings')
    .set('cookie', controlled.cookie)
    .expect(200);

  const payment = verifiedApp({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
  });
  const pay = await request(payment.app)
    .get('/pay')
    .set('cookie', payment.cookie)
    .expect(200);
  assert.match(pay.text, /data-pay-form/);
  assert.match(pay.text, /Approve in Keychain/);
  assert.match(pay.text, /If confirmation is unclear, don’t pay again/);
});

test('M15.5 sparse, unavailable, malformed-pagination, and future-capability states fail honestly', async () => {
  const { app } = createFixtureApp();
  const threads = await request(app).get('/community/threads').expect(200);
  assert.match(threads.text, /No threads yet/);
  assert.match(threads.text, /Short posts and replies will appear here|Threads aren’t available yet/);

  const unavailableRpc = {
    getStatus: () => [],
    async call(api, method) {
      if (`${api}.${method}` === 'bridge.get_community') {
        return { name: 'hive-108590', title: '4th Street Bar', subscribers: 1 };
      }
      throw new Error('m15-5-fixture-feed-failure');
    },
  };
  const unavailable = createApp({ config: configFrom(), logger, rpcPool: unavailableRpc });
  const community = await request(unavailable).get('/community').expect(200);
  assert.match(community.text, /Posts are temporarily unavailable/);
  assert.doesNotMatch(community.text, /m15-5-fixture-feed-failure/);

  const badCursor = await request(app)
    .get('/profile/etblink/followers?after=not+base64!')
    .set('accept', 'application/json')
    .expect(400);
  assert.equal(badCursor.body.error.message, 'Connection pagination cursor is invalid');
  assert.doesNotMatch(badCursor.text, /at .*\.js:/);

  await request(app).get('/explore').expect(404);
  await request(app).get('/create').expect(404);

  const home = await request(app).get('/').expect(200);
  const document = documentFor(home.text);
  const disabledLabels = Array.from(document.querySelectorAll('.app-nav-link[aria-disabled="true"]'))
    .map((item) => item.querySelector('.app-nav-label')?.textContent.trim())
    .filter(Boolean);
  assert.deepEqual(disabledLabels, ['Explore', 'Create', 'Pay']);
  assert.doesNotMatch(document.querySelector('.app-primary-nav')?.textContent || '', /\bLive\b|\bEvents?\b/);
  document.defaultView?.close();
});

test('M15.5 responsive source contracts cover the required review matrix without motion or touch regressions', () => {
  const shellCss = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
  const socialCss = fs.readFileSync(path.join(ROOT, 'public', 'css', 'm15-social.css'), 'utf8');
  const walletPayCss = fs.readFileSync(path.join(ROOT, 'public', 'css', 'm15-wallet-pay.css'), 'utf8');
  const combinedCss = `${shellCss}\n${socialCss}\n${walletPayCss}`;
  const acceptanceDoc = fs.readFileSync(
    path.join(ROOT, 'docs', 'M15_5_CROSS_PLATFORM_VISUAL_ACCEPTANCE.md'),
    'utf8',
  );

  assert.match(shellCss, /body\s*\{[^}]*min-width:\s*320px/s);
  assert.match(shellCss, /safe-area-inset-bottom/);
  assert.match(shellCss, /min-height:\s*44px/);
  assert.match(combinedCss, /@media\s*\(min-width:\s*640px\)/);
  assert.match(combinedCss, /@media\s*\(min-width:\s*900px\)/);
  assert.match(combinedCss, /@media\s*\(min-width:\s*1024px\)/);
  assert.match(shellCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(shellCss, /padding-left:\s*var\(--hb-shell-rail\)/);

  for (const width of REVIEW_WIDTHS) {
    assert.match(acceptanceDoc, new RegExp(`\\b${width}\\s*px\\b`));
  }
});

test('M15.5 cumulative regression suite retains the required accessibility, owner, pagination, and payment-state evidence', () => {
  const sources = {
    accessibility: fs.readFileSync(path.join(ROOT, 'test', 'accessibility-responsive.test.js'), 'utf8'),
    app: fs.readFileSync(path.join(ROOT, 'test', 'app.test.js'), 'utf8'),
    m4: fs.readFileSync(path.join(ROOT, 'test', 'm4-ui.test.js'), 'utf8'),
    payment: fs.readFileSync(path.join(ROOT, 'test', 'payment-api.test.js'), 'utf8'),
    payClient: fs.readFileSync(path.join(ROOT, 'test', 'pay-tab-client.test.js'), 'utf8'),
  };

  assert.match(sources.accessibility, /serious or critical violations on key public documents/);
  assert.match(sources.accessibility, /automated 360 CSS-pixel responsive contract/);
  assert.match(sources.app, /approved empty production thread state honestly/);
  assert.match(sources.m4, /enforces verified ownership for inbox and settings routes/);
  assert.match(sources.m4, /continuation cursor without duplicating the inclusive anchor/);
  assert.match(sources.payment, /preflights, reviews, records acceptance, and confirms one exact merchant payment/);
  assert.match(sources.payment, /keeps ambiguous or uncorrelated broadcasts pending and times out without a retry path/);
  assert.match(sources.payment, /same-account pending receipt to be safely rechecked after write mode is disabled/);
  assert.match(sources.payClient, /cannot render Paid before chain confirmation/);
  assert.match(sources.payClient, /review cancellation records Cancelled without opening Keychain/);
});
