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
const SESSION_SECRET = 'm18-3-experience-session-secret-at-least-32-bytes';
const WALL_SOURCE = fs.readFileSync(
  path.join(ROOT, 'views', 'pages', 'profile', 'partials', 'wall-posts.ejs'),
  'utf8',
);
const COMPOSER_FIELD_SOURCE = fs.readFileSync(
  path.join(ROOT, 'views', 'common', 'composer', 'field.ejs'),
  'utf8',
);
const COMPOSER_FORM_SOURCE = fs.readFileSync(
  path.join(ROOT, 'views', 'common', 'composer', 'form.ejs'),
  'utf8',
);
const COMPOSER_CLIENT_SOURCE = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'composer-presentation.js'),
  'utf8',
);
const PAY_SOURCE = fs.readFileSync(path.join(ROOT, 'views', 'pages', 'pay', 'index.ejs'), 'utf8');
const PAY_RECEIPT_SOURCE = fs.readFileSync(
  path.join(ROOT, 'views', 'pages', 'pay', 'partials', 'receipt.ejs'),
  'utf8',
);

function documentFor(html) {
  return new JSDOM(html).window.document;
}

function controlledApp({ payment = false } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
    ...(payment
      ? {
          HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
          HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
          HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
        }
      : {}),
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

test('M18.3 Home remains venue-first while UX-1F supersedes its historical presentation', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200);
  const document = documentFor(response.text);
  const main = document.querySelector('main[data-m18-3-surface="home"]');

  assert.ok(main);
  const hero = main.querySelector('.home-hero');
  assert.equal(
    hero?.querySelector('img[src="/images/fourth-street-bar-patio.jpg"]')?.getAttribute('src'),
    '/images/fourth-street-bar-patio.jpg',
  );
  assert.equal(hero?.querySelector('img[src="/images/fourth-street-bar-logo.jpg"]'), null);
  assert.equal(main.querySelectorAll('h1').length, 1);
  assert.match(hero?.querySelector('h1')?.textContent || '', /4th Street Bar/);
  assert.equal(hero?.querySelector('a.button-primary')?.getAttribute('href'), '/community');
  assert.equal(hero?.querySelector('a[href="#visit"]')?.textContent.trim(), 'Plan your visit');

  const children = Array.from(main.children);
  assert.deepEqual(children.map((item) => item.classList[0]), [
    'home-hero',
    'home-updates',
    'home-pathways',
    'home-gallery',
  ]);

  const visit = main.querySelector('#visit');
  assert.match(visit?.textContent || '', /Address/);
  assert.match(visit?.textContent || '', /Hours/);
  assert.match(visit?.textContent || '', /Phone/);

  assert.match(main.textContent, /Anyone can browse the public community/);
  assert.match(main.textContent, /Your private keys stay in Keychain/);

  const approved = new Set([
    '/images/fourth-street-bar-patio.jpg',
    '/images/fourth-street-bar-pool-table.jpg',
    '/images/fourth-street-bar-bartender.jpg',
    '/images/fourth-street-bar-exterior.jpg',
  ]);
  assert.equal(
    Array.from(main.querySelectorAll('img'), (image) => image.getAttribute('src'))
      .every((source) => approved.has(source)),
    true,
  );
  assert.equal(main.querySelectorAll('img').length, 4);
  assert.doesNotMatch(main.textContent, /\bLive\b|\bEvents?\b|\bNearby\b|\bFor You\b/);
  assert.equal(main.querySelector('input[type="search"]'), null);
});

test('M18.3 signed-out Wall leads with public conversation and hides composers', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/etblink/wall-posts').expect(200);
  const document = documentFor(response.text);
  const wall = document.querySelector('[data-m18-3-surface="wall"]');

  assert.ok(wall);
  assert.match(wall.querySelector('#wall-heading')?.textContent || '', /@etblink.*Wall/i);
  assert.match(wall.textContent, /Posting a wall message costs at least/);
  assert.match(wall.textContent, /Public on Hive/);
  assert.match(wall.textContent, /Sign in with Hive Keychain/);
  assert.ok(wall.querySelector('#public-wall-messages-heading'));
  assert.equal(wall.querySelector('[data-wall-privacy-form]'), null);
  assert.equal(wall.querySelector('form[data-m4-action="wall"]'), null);
  assert.equal(wall.querySelector('form[data-m4-action="inbox"]'), null);
});

test('M18.3 authenticated Wall uses one public-first composer with an explicit privacy toggle', async () => {
  const fixture = controlledApp();
  const response = await request(fixture.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);
  const wall = document.querySelector('[data-m18-3-surface="wall"]');
  const form = wall?.querySelector('form[data-wall-privacy-form]');
  const feedHeading = wall?.querySelector('#public-wall-messages-heading');

  assert.ok(form);
  assert.equal(form.dataset.m4Action, 'wall');
  assert.equal(form.dataset.wallEnabled, 'true');
  assert.equal(form.dataset.inboxEnabled, 'true');
  assert.ok(form.compareDocumentPosition(feedHeading) & 4);
  assert.equal(form.querySelector('input[name="recipient"]')?.value, 'etblink');
  assert.equal(form.querySelector('input[name="expectedFee"]')?.value, '1.000 HBD');
  assert.equal(form.querySelector('input[name="amount"]')?.value, '1.000 HBD');
  assert.ok(form.querySelector('[data-byte-counter]'));
  assert.ok(form.querySelector('[data-m4-status]'));
  assert.equal(form.querySelector('textarea[name="message"]')?.dataset.maxBytes, '2000');
  assert.equal(form.querySelector('[data-wall-privacy-toggle]')?.checked, false);
  assert.match(form.textContent, /Encrypt this message \(private\)/);
  assert.match(form.textContent, /Unchecked messages are public on Hive/);
  assert.match(form.textContent, /permanently public on Hive/i);
  assert.equal(wall.querySelectorAll('form[data-m4-action="inbox"]').length, 0);
  assert.equal(wall.querySelectorAll('[data-composer]').length, 1);
  assert.ok(wall.textContent.includes('Transaction details'));
});

test('M18.3 Pay is task-first without changing payment hooks or no-retry semantics', async () => {
  const fixture = controlledApp({ payment: true });
  const response = await request(fixture.app)
    .get('/pay')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);
  const pay = document.querySelector('main[data-m18-3-surface="pay"]');

  assert.ok(pay);
  assert.match(pay.querySelector('h1')?.textContent || '', /Pay your tab with HBD/);
  assert.equal(pay.querySelector('.pay-merchant-logo')?.getAttribute('src'), '/images/fourth-street-bar-logo.jpg');
  assert.match(pay.textContent, /Maximum payment 1\.000 HBD/);

  const task = pay.querySelector('.m18-pay-task');
  for (const selector of [
    '[data-pay-form]',
    '[data-pay-camera-start]',
    '[data-pay-camera-stop]',
    '[data-pay-image]',
    '[data-pay-uri]',
    '[data-pay-status]',
    '[data-pay-receipt]',
    '[data-pay-recheck]',
  ]) {
    assert.ok(task?.querySelector(selector), selector);
  }

  assert.match(pay.textContent, /Paid means confirmed/);
  assert.match(pay.textContent, /independent Hive nodes confirm the same transfer is final/);
  assert.match(pay.textContent, /If confirmation is unclear, don’t pay again/);
  assert.match(pay.textContent, /Keychain approval can happen before Hive-Bar sees final confirmation/);
  assert.doesNotMatch(pay.textContent, /\bUSD\b|subtotal|line item|suggested tip/i);
  assert.equal(pay.querySelector('[data-distriator-claim]'), null);
});

test('M18.3 signed-out Pay remains a sign-in gate with no payment form', async () => {
  const { app } = createFixtureApp({
    configOverrides: {
      HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
      HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    },
  });
  const response = await request(app).get('/pay').expect(200);
  const document = documentFor(response.text);
  const pay = document.querySelector('main[data-m18-3-surface="pay"]');

  assert.ok(pay);
  assert.match(pay.textContent, /Sign in to pay/);
  assert.match(pay.textContent, /does not send a transaction/);
  assert.equal(pay.querySelector('[data-pay-form]'), null);
  assert.match(pay.textContent, /If confirmation is unclear, don’t pay again/);
});

test('M18.3 source contracts retain dynamic fees and every accepted write/payment hook', () => {
  for (const pattern of [
    /<%= profileSettings\.wallFee %>/,
    /privateOnly \? 'inbox' : 'wall'/,
    /privateOnly \? 1500 : 2000/,
    /role: 'wall-privacy-toggle'/,
  ]) assert.match(WALL_SOURCE, pattern);
  assert.match(COMPOSER_FIELD_SOURCE, /data-wall-privacy-toggle/);
  assert.match(COMPOSER_FORM_SOURCE, /data-m4-action="<%= composer\.action %>"/);
  assert.match(COMPOSER_FORM_SOURCE, /data-wall-privacy-form/);
  assert.match(COMPOSER_CLIENT_SOURCE, /form\.dataset\.m4Action = privateMode \? 'inbox' : 'wall'/);
  assert.match(COMPOSER_CLIENT_SOURCE, /WALL_PRIVATE_LIMIT = 1500/);
  assert.match(COMPOSER_CLIENT_SOURCE, /WALL_PUBLIC_LIMIT = 2000/);

  for (const pattern of [
    /data-pay-form/,
    /data-pay-camera-start/,
    /data-pay-camera-stop/,
    /data-pay-image/,
    /data-pay-uri/,
    /data-pay-status/,
  ]) assert.match(PAY_SOURCE, pattern);

  for (const pattern of [
    /data-pay-receipt/,
    /data-pay-recheck/,
  ]) assert.match(PAY_RECEIPT_SOURCE, pattern);
});
