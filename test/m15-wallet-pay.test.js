'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { createFixtureRpc } = require('./support/fixture-rpc');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');

const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';

function controlledApp({ payment = false } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
    ...(payment ? {
      HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
      HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
      HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    } : {}),
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

test('M15.4 Wallet is human-first while remaining a public read-only snapshot', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/etblink/wallet').expect(200);

  assert.match(response.text, /data-m15-surface="wallet"/);
  assert.match(response.text, /Public on Hive/);
  assert.match(response.text, /Liquid HIVE/);
  assert.match(response.text, /Liquid HBD/);
  assert.match(response.text, /Hive Power/);
  assert.match(response.text, /Voting power/);
  assert.match(response.text, /Resource credits/);
  assert.match(response.text, /Claimable rewards/);
  assert.match(response.text, /This page only reads public Hive data/);
  assert.match(response.text, /cannot move funds or access private keys/);
  assert.doesNotMatch(response.text, /data-m4-action="claim-rewards"/);
});

test('M15.4 Wallet retains the exact owner reward-claim gate', async () => {
  const owner = controlledApp();
  const response = await request(owner.app)
    .get('/profile/etblink/wallet')
    .set('cookie', owner.cookie)
    .expect(200);

  assert.match(response.text, /data-m4-action="claim-rewards"/);
  assert.match(response.text, /Review reward claim/);
  assert.match(response.text, /checks your current rewards again before Keychain asks for approval/i);
});

test('M15.4 Pay presents merchant identity and the no-duplicate-payment model before sign-in', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/pay').expect(200);

  assert.match(response.text, /data-m15-surface="pay"/);
  assert.match(response.text, /src="\/images\/fourth-street-bar-logo\.jpg"/);
  assert.match(response.text, /Pay at 4th Street Bar/);
  assert.match(response.text, /Pay your tab with HBD/);
  assert.match(response.text, /Paid means confirmed/);
  assert.match(response.text, /independent Hive nodes confirm the same transfer is final/);
  assert.match(response.text, /If confirmation is unclear, don’t pay again/);
  assert.match(response.text, /Keychain approval can happen before Hive-Bar sees final confirmation/);
  assert.match(response.text, /Sign in to pay/);
  assert.doesNotMatch(response.text, /data-pay-form/);
});

test('M15.4 controlled Pay keeps every existing payment hook and review boundary', async () => {
  const fixture = controlledApp({ payment: true });
  const response = await request(fixture.app)
    .get('/pay')
    .set('cookie', fixture.cookie)
    .expect(200);

  assert.match(response.text, /data-pay-form/);
  assert.match(response.text, /data-pay-camera-start/);
  assert.match(response.text, /data-pay-camera-stop/);
  assert.match(response.text, /data-pay-image/);
  assert.match(response.text, /data-pay-uri/);
  assert.match(response.text, /data-pay-status/);
  assert.match(response.text, /data-pay-receipt/);
  assert.match(response.text, /data-pay-receipt-state/);
  assert.match(response.text, /data-pay-recheck/);
  assert.match(response.text, /Check payment details/);
  assert.match(response.text, /Hive-Bar checks the payment and shows you exactly what will be sent/);
  assert.match(response.text, /Rebates are not available through Hive-Bar right now/);
  assert.doesNotMatch(response.text, /data-distriator-claim/);
  assert.match(response.text, /Maximum payment 1\.000 HBD/);
});

test('M15.4 preserves the accepted browser payment state machine source', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'pay-tab.js'), 'utf8');

  assert.match(source, /authority: 'Active'/);
  assert.match(source, /receipt\.state === 'ChainConfirmed'/);
  assert.match(source, /'BroadcastAccepted', 'ConfirmationTimeout'/);
  assert.match(source, /Do not retry automatically|do not retry automatically/);
  assert.match(source, /Recheck Hive before considering any new payment/);
});

test('M15.4 presentation stylesheet is local, token-driven, and contains no remote asset dependency', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'm15-wallet-pay.css'), 'utf8');
  const payTemplate = fs.readFileSync(path.join(__dirname, '..', 'views', 'pages', 'pay', 'index.ejs'), 'utf8');

  assert.match(css, /var\(--hb-bg\)|var\(--hb-text\)/);
  assert.match(css, /\.wallet-social/);
  assert.match(css, /\.pay-shell/);
  assert.match(css, /\.pay-receipt/);
  assert.doesNotMatch(css, /https?:\/\//i);
  assert.doesNotMatch(css, /url\s*\(/i);
  assert.doesNotMatch(payTemplate, /\bUSD\b|subtotal|line item|suggested tip/i);
});
