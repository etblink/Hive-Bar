'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { createFixtureRpc } = require('./support/fixture-rpc');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');

const CSS_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'input.css'), 'utf8');
const LOGO_PATH = path.join(__dirname, '..', 'public', 'images', 'fourth-street-bar-logo.jpg');
const LOGO_SHA256 = 'c57379e4dc46a367879fc0dc67b61b5514ede4fd795cfbbc0ea116914cea91da';

function shellLabels(document) {
  return Array.from(document.querySelectorAll('.app-primary-nav .app-nav-item'))
    .map((item) => item.querySelector('.app-nav-label')?.textContent.trim() || '')
    .filter(Boolean);
}

test('M18.2 shell presents only real patron destinations with local inert icons', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200);
  const dom = new JSDOM(response.text);
  const { document } = dom.window;

  assert.deepEqual(shellLabels(document), ['Home', 'Community', 'Threads', 'Sign in']);

  assert.equal(document.querySelector('a.app-nav-link[href="/"]')?.getAttribute('aria-current'), 'page');
  assert.equal(document.querySelector('a.app-nav-link[href="/community"] .app-nav-label')?.textContent.trim(), 'Community');
  assert.equal(document.querySelector('a.app-nav-link[href="/community/threads"] .app-nav-label')?.textContent.trim(), 'Threads');
  assert.equal(document.querySelector('a.app-nav-link[href="/pay"]'), null);

  const disabledLabels = Array.from(document.querySelectorAll('.app-nav-link[aria-disabled="true"]'))
    .map((item) => item.querySelector('.app-nav-label')?.textContent.trim() || '')
    .filter(Boolean);
  assert.deepEqual(disabledLabels, []);

  assert.equal(document.querySelector('a[href="/explore"]'), null);
  assert.equal(document.querySelector('a[href="/create"]'), null);
  assert.equal(document.querySelector('.app-nav-item--community'), null);
  assert.ok(document.querySelector('.app-nav-signin form[data-keychain-login]'));
  assert.match(response.text, /Never enter a private key here\./);
  assert.equal(document.querySelectorAll('svg.app-nav-icon').length, 4);
  assert.equal(document.querySelector('svg script, svg foreignObject, svg [href]'), null);
  for (const icon of document.querySelectorAll('svg.app-nav-icon')) {
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
  }

  dom.window.close();

  await request(app).get('/explore').expect(404);
  await request(app).get('/create').expect(404);
});

test('M15.2 signed-in You destination reuses the verified Hive session and keeps sign-out explicit', async () => {
  const config = configFrom({
    HIVE_WRITE_MODE: 'disabled',
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-bytes',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create('etblink');
  const app = createApp({
    config,
    logger,
    rpcPool: createFixtureRpc(),
    sessionStore,
  });

  const response = await request(app)
    .get('/profile/etblink')
    .set('cookie', `hive_bar_session=${token}`)
    .expect(200);

  const dom = new JSDOM(response.text);
  const { document } = dom.window;
  const you = document.querySelector('a.app-nav-link[href="/profile/etblink"]');

  assert.ok(you);
  assert.equal(you.getAttribute('aria-current'), 'page');
  assert.equal(you.querySelector('.app-nav-label')?.textContent.trim(), 'You');
  assert.equal(document.querySelector('a.app-nav-link[href="/pay"]'), null);
  assert.ok(document.querySelector('button[data-keychain-logout]'));
  assert.equal(document.querySelector('form[data-keychain-login]'), null);
  assert.match(document.querySelector('.app-account__identity')?.textContent || '', /@etblink/);
  assert.match(response.text, /Signed in with Hive Keychain/);

  dom.window.close();
});

test('M18.2 venue tokens and coordinated responsive shell contracts are explicit in source CSS', () => {
  const requiredTokens = [
    '--venue-canvas: #080706',
    '--venue-surface-1: #11100f',
    '--venue-surface-2: #191613',
    '--venue-surface-3: #241f1b',
    '--venue-border: #3c342e',
    '--venue-text: #f7f1e8',
    '--venue-text-muted: #c8bfb4',
    '--venue-text-subtle: #9b9085',
    '--venue-accent: #f4a460',
    '--venue-info: #8fb4e0',
    '--venue-success: #76b78a',
    '--venue-warning: #f0b86b',
    '--venue-danger: #f08a8a',
    '--hb-shell-rail: 15rem',
  ];

  for (const token of requiredTokens) {
    assert.match(CSS_SOURCE, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(CSS_SOURCE, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(CSS_SOURCE, /\.app-nav-item--community/);
  assert.match(CSS_SOURCE, /@media\s*\(min-width:\s*1200px\)/);
  assert.match(CSS_SOURCE, /padding-left:\s*var\(--hb-shell-rail\)/);
  assert.match(CSS_SOURCE, /safe-area-inset-bottom/);
  assert.match(CSS_SOURCE, /min-height:\s*44px/);
  assert.match(CSS_SOURCE, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(CSS_SOURCE, /@import\s+url\(/i);
});

test('M15.2 uses the exact owner-supplied local 4th Street Bar logo', async () => {
  const logo = fs.readFileSync(LOGO_PATH);
  assert.equal(logo.length, 34268);
  assert.equal(crypto.createHash('sha256').update(logo).digest('hex'), LOGO_SHA256);

  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200);
  const dom = new JSDOM(response.text);
  const { document } = dom.window;
  const logoImage = document.querySelector('img[data-bar-logo]');

  assert.ok(logoImage);
  assert.equal(logoImage.getAttribute('src'), '/images/fourth-street-bar-logo.jpg');
  assert.equal(logoImage.getAttribute('width'), '720');
  assert.equal(logoImage.getAttribute('height'), '720');
  assert.equal(logoImage.getAttribute('alt'), '');

  dom.window.close();
});

test('M15.2 keeps venue identity above technology attribution and does not surface future mockup concepts', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200);
  const dom = new JSDOM(response.text);
  const { document } = dom.window;

  assert.match(document.querySelector('.app-brand')?.textContent || '', /4th Street Bar/);
  assert.match(document.querySelector('.app-brand')?.textContent || '', /Hive-Bar/);
  assert.match(document.querySelector('.app-technology-attribution')?.textContent || '', /Powered by Hive/);

  const navText = document.querySelector('.app-primary-nav')?.textContent || '';
  assert.doesNotMatch(navText, /\bLive\b/);
  assert.doesNotMatch(navText, /\bEvents?\b/);
  assert.doesNotMatch(navText, /\bFollowing\b/);

  dom.window.close();
});
