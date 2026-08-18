'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { FIRST_PARTY_ASSETS } = require('../src/release/static-assets');
const { createFixtureRpc } = require('./support/fixture-rpc');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');

function documentFor(html) {
  return new JSDOM(html).window.document;
}

function navLabels(document) {
  return Array.from(document.querySelectorAll('.app-primary-nav .app-nav-label')).map((item) =>
    item.textContent.trim(),
  );
}

test('M18.2 signed-out shell exposes four real destinations and constrained local icons', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200);
  const document = documentFor(response.text);

  assert.deepEqual(navLabels(document), ['Home', 'Community', 'Threads', 'Sign in']);
  assert.equal(document.querySelectorAll('.app-primary-nav .app-nav-item').length, 4);
  assert.equal(document.querySelector('.app-primary-nav [aria-disabled="true"]'), null);
  assert.equal(document.querySelector('.app-primary-nav a[href="/pay"]'), null);
  assert.equal(document.querySelector('.app-primary-nav a[href="/explore"]'), null);
  assert.equal(document.querySelector('.app-primary-nav a[href="/create"]'), null);

  const icons = document.querySelectorAll('.app-primary-nav svg.app-nav-icon');
  assert.equal(icons.length, 4);
  assert.equal(document.querySelector('svg script, svg foreignObject, svg [href], svg [onload]'), null);
  for (const icon of icons) {
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('focusable'), 'false');
  }

  document.defaultView?.close();
});

test('M18.2 active navigation follows route purpose rather than page-title text', async () => {
  const { app } = createFixtureApp();

  const postDocument = documentFor(
    (await request(app).get('/post/etblink/welcome-fourth-street-bar').expect(200)).text,
  );
  assert.equal(
    postDocument.querySelector('.app-primary-nav a[href="/community"]')?.getAttribute('aria-current'),
    'page',
  );
  postDocument.defaultView?.close();

  const threadsDocument = documentFor(
    (await request(app).get('/community/threads').expect(200)).text,
  );
  assert.equal(
    threadsDocument
      .querySelector('.app-primary-nav a[href="/community/threads"]')
      ?.getAttribute('aria-current'),
    'page',
  );
  assert.equal(
    threadsDocument.querySelector('.app-primary-nav a[href="/community"]')?.getAttribute('aria-current'),
    null,
  );
  threadsDocument.defaultView?.close();
});

test('M18.2 signed-in shell keeps dormant Pay code outside primary navigation', async () => {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    SESSION_SECRET: 'm18-shell-session-secret-that-is-at-least-32-bytes',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create('etblink');
  const app = createApp({ config, logger, rpcPool: createFixtureRpc(), sessionStore });

  const response = await request(app)
    .get('/profile/etblink')
    .set('cookie', `hive_bar_session=${token}`)
    .expect(200);
  const document = documentFor(response.text);

  assert.deepEqual(navLabels(document), ['Home', 'Community', 'Threads', 'You']);
  assert.equal(document.querySelector('.app-primary-nav a[href="/pay"]'), null);
  assert.equal(
    document.querySelector('.app-primary-nav a[href="/profile/etblink"]')?.getAttribute('aria-current'),
    'page',
  );
  document.defaultView?.close();

  await request(app).get('/pay').set('cookie', `hive_bar_session=${token}`).expect(200);
});

test('M18.2 expected owner authentication is an intentional access state', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/etblink/inbox').expect(401);
  const document = documentFor(response.text);

  assert.equal(document.title, 'Sign in required');
  assert.match(document.querySelector('h1')?.textContent || '', /Sign in required/);
  assert.doesNotMatch(document.querySelector('main')?.textContent || '', /Something went wrong/);
  assert.equal(document.querySelector('main section')?.getAttribute('role'), 'status');
  assert.equal(document.querySelector('a[href="/#hive-sign-in"]')?.textContent.trim(), 'Go to sign in');

  document.defaultView?.close();
});

test('M18.2 foundation binds warm venue tokens, status semantics, and coordinated breakpoints', () => {
  const css = fs.readFileSync(path.join(ROOT, 'src', 'input.css'), 'utf8');
  const socialCss = fs.readFileSync(path.join(ROOT, 'public', 'css', 'm15-social.css'), 'utf8');

  for (const token of [
    '--venue-canvas',
    '--venue-surface-1',
    '--venue-text',
    '--venue-accent',
    '--venue-info',
    '--venue-success',
    '--venue-warning',
    '--venue-danger',
  ]) {
    assert.match(css, new RegExp(`${token}:`));
  }

  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(min-width:\s*1200px\)/);
  assert.match(socialCss, /@media\s*\(min-width:\s*1280px\)/);
  assert.match(css, /\.app-state--pending/);
  assert.match(css, /\.app-state--empty/);
  assert.match(css, /\.app-state--ambiguous/);
  assert.match(css, /\.app-state--error/);
  assert.match(
    css,
    /\.transaction-review\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*max-height:\s*calc\(100dvh - 2rem\);[^}]*margin:\s*auto;/s,
  );
  assert.match(
    css,
    /\.transaction-review \[data-social-summary\]\s*\{[^}]*overflow-x:\s*hidden;[^}]*white-space:\s*pre-wrap;/s,
  );
  assert.match(
    css,
    /\[aria-busy="true"\]::before\s*\{[^}]*position:\s*absolute;[^}]*top:\s*0\.75rem;[^}]*right:\s*0\.75rem;[^}]*margin:\s*0;[^}]*content:\s*"Loading…";/s,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*1199px\)\s*\{[\s\S]*?\.app-footer\s*\{[^}]*padding-inline:\s*0;/,
  );
  assert.match(
    socialCss,
    /\.community-shell,\s*\.profile-shell\s*\{[^}]*padding-block:\s*1\.25rem 2\.5rem;/s,
  );
  assert.doesNotMatch(
    socialCss,
    /@media\s*\(max-width:\s*1199px\)\s*\{[\s\S]*?\.profile-shell\s*\{[^}]*padding-bottom:/,
  );
  assert.match(
    css,
    /@media\s*\(min-width:\s*1200px\)[\s\S]*?\.app-brand__wordmark strong\s*\{[^}]*text-overflow:\s*clip;[^}]*white-space:\s*normal;/,
  );
  assert.match(css, /\.button-primary:disabled/);
  assert.ok(FIRST_PARTY_ASSETS.includes('/css/m15-wallet-pay.css'));
});
