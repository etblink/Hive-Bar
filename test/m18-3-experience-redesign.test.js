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
const PAY_SOURCE = fs.readFileSync(path.join(ROOT, 'views', 'pages', 'pay', 'index.ejs'), 'utf8');

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

test('M18.3 Home is venue-first while keeping activity before visit information', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200);
  const document = documentFor(response.text);
  const main = document.querySelector('main[data-m18-3-surface="home"]');

  assert.ok(main);
  const hero = main.querySelector('.social-home-hero');
  assert.equal(
    hero?.querySelector('img[src="/images/fourth-street-bar-patio.jpg"]')?.getAttribute('src'),
    '/images/fourth-street-bar-patio.jpg',
  );
  assert.equal(
    hero?.querySelector('.social-home-hero__logo')?.getAttribute('src'),
    '/images/fourth-street-bar-logo.jpg',
  );
  assert.match(hero?.querySelector('h1')?.textContent || '', /4th Street Bar/);
  assert.equal(hero?.querySelector('a.button-primary')?.getAttribute('href'), '/community');
  assert.equal(hero?.querySelector('a[href="#visit"]')?.textContent.trim(), 'Visit the bar');

  const children = Array.from(main.children);
  const feedIndex = children.findIndex((item) => item.classList.contains('social-home-feed'));
  const visitIndex = children.findIndex((item) => item.id === 'visit');
  assert.ok(feedIndex >= 0);
  assert.ok(visitIndex > feedIndex);

  const visit = main.querySelector('#visit');
  assert.match(visit?.textContent || '', /Address/);
  assert.match(visit?.textContent || '', /Hours/);
  assert.match(visit?.textContent || '', /Phone/);

  assert.match(main.textContent, /Anyone can browse; sign in with Hive Keychain when you want to participate/);
  assert.match(main.textContent, /Your private keys stay in Keychain/);

  const approved = new Set([
    '/images/fourth-street-bar-patio.jpg',
    '/images/fourth-street-bar-logo.jpg',
    '/images/fourth-street-bar-pool-table.jpg',
    '/images/fourth-street-bar-bartender.jpg',
    '/images/fourth-street-bar-exterior.jpg',
  ]);
  assert.equal(
    Array.from(main.querySelectorAll('img'), (image) => image.getAttribute('src'))
      .every((source) => approved.has(source)),
    true,
  );
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
  assert.equal(wall.querySelector('form[data-m4-action="wall"]'), null);
  assert.equal(wall.querySelector('form[data-m4-action="inbox"]'), null);
});

test('M18.3 authenticated Wall makes public composition primary and private composition secondary', async () => {
  const fixture = controlledApp();
  const response = await request(fixture.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);
  const wall = document.querySelector('[data-m18-3-surface="wall"]');
  const publicForm = wall?.querySelector('form[data-m4-action="wall"]');
  const privateDisclosure = wall?.querySelector('details[data-m18-private-composer]');
  const privateForm = privateDisclosure?.querySelector('form[data-m4-action="inbox"]');
  const feedHeading = wall?.querySelector('#public-wall-messages-heading');

  assert.ok(publicForm);
  assert.ok(privateDisclosure);
  assert.ok(privateForm);
  assert.equal(privateDisclosure.hasAttribute('open'), false);
  assert.ok(publicForm.compareDocumentPosition(privateDisclosure) & 4);
  assert.ok(privateDisclosure.compareDocumentPosition(feedHeading) & 4);

  for (const form of [publicForm, privateForm]) {
    assert.equal(form.querySelector('input[name="recipient"]')?.value, 'etblink');
    assert.equal(form.querySelector('input[name="expectedFee"]')?.value, '1.000 HBD');
    assert.equal(form.querySelector('input[name="amount"]')?.value, '1.000 HBD');
    assert.ok(form.querySelector('[data-byte-counter]'));
    assert.ok(form.querySelector('[data-m4-status]'));
  }

  assert.equal(publicForm.querySelector('textarea[name="message"]')?.dataset.maxBytes, '2000');
  assert.equal(privateForm.querySelector('textarea[name="message"]')?.dataset.maxBytes, '1500');
  assert.match(publicForm.textContent, /permanently public on Hive/i);
  assert.match(privateForm.textContent, /Keychain encrypts the message in this browser/);
  assert.match(privateForm.textContent, /HBD amount, time, and transaction remain public on Hive/);
  assert.ok(wall.querySelector('summary')?.textContent.includes('Send a private message'));
  assert.ok(wall.querySelector('summary') && wall.textContent.includes('Transaction details'));
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
    /data-m4-action="wall"/,
    /data-m4-action="inbox"/,
    /data-max-bytes="2000"/,
    /data-max-bytes="1500"/,
  ]) assert.match(WALL_SOURCE, pattern);

  for (const pattern of [
    /data-pay-form/,
    /data-pay-camera-start/,
    /data-pay-camera-stop/,
    /data-pay-image/,
    /data-pay-uri/,
    /data-pay-status/,
    /data-pay-receipt/,
    /data-pay-recheck/,
  ]) assert.match(PAY_SOURCE, pattern);
});
