'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { BETA_ACTIONS } = require('../src/beta/actions');
const { FIRST_PARTY_ASSETS } = require('../src/release/static-assets');
const { V1_ACTIONS } = require('../src/v1/actions');
const {
  UX1F_UPDATES,
  createUx1fVisualFixture,
} = require('./support/ux-1f-fixture');

const ROOT = path.join(__dirname, '..');
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
const EXPECTED_READ_OPTIONS = {
  account: 'fourthstreetbar',
  community: 'hive-108590',
  limit: 3,
};

function documentFor(html) {
  return new JSDOM(html, { url: 'https://fourthstreetbar.com/' }).window.document;
}

function assetPath(href) {
  return new URL(href, 'https://fourthstreetbar.com/').pathname;
}

function assertSingleBoundedRead(fixture) {
  assert.deepEqual(fixture.readCalls, [{
    method: 'getOfficialCommunityPosts',
    options: EXPECTED_READ_OPTIONS,
  }]);
  assert.deepEqual(fixture.unexpectedReadCalls, []);
  assert.deepEqual(fixture.rpcPool.calls, []);
  assert.deepEqual(fixture.mutationAttempts, []);
}

test('UX-1F ready homepage has one dominant brand, exact actions, editorial updates, and authentic imagery', async () => {
  const fixture = createUx1fVisualFixture('ready');
  const response = await request(fixture.app).get('/').expect(200);
  const document = documentFor(response.text);
  const main = document.querySelector('main[data-ux-1f-surface="home"]');

  assert.ok(main);
  assert.deepEqual(Array.from(main.children, (element) => element.classList[0]), [
    'home-hero',
    'home-updates',
    'home-pathways',
    'home-gallery',
  ]);
  assert.equal(main.querySelectorAll('h1').length, 1);
  assert.equal(main.querySelector('h1')?.textContent.trim(), '4th Street Bar');
  assert.equal(main.querySelector('img[src="/images/fourth-street-bar-logo.jpg"]'), null);

  const hero = main.querySelector('[data-home-hero]');
  assert.equal(hero?.querySelector('.home-hero__image')?.getAttribute('src'), '/images/fourth-street-bar-patio.jpg');
  assert.equal(hero?.querySelector('.home-hero__image')?.getAttribute('loading'), null);
  assert.equal(hero?.querySelector('.home-hero__primary')?.getAttribute('href'), '/community');
  assert.equal(hero?.querySelector('.home-hero__secondary')?.getAttribute('href'), '#visit');

  const updates = main.querySelector('[data-home-updates-state="ready"]');
  assert.equal(updates?.querySelectorAll('.home-update').length, UX1F_UPDATES.length);
  assert.deepEqual(
    Array.from(updates?.querySelectorAll('.home-update h3 a') || [], (link) => link.getAttribute('href')),
    UX1F_UPDATES.map(({ author, permlink }) => `/post/${author}/${permlink}`),
  );
  assert.equal(updates?.querySelector('.state-card'), null);

  const images = Array.from(main.querySelectorAll('img'));
  assert.deepEqual(images.map((image) => image.getAttribute('src')), [
    '/images/fourth-street-bar-patio.jpg',
    '/images/fourth-street-bar-pool-table.jpg',
    '/images/fourth-street-bar-bartender.jpg',
    '/images/fourth-street-bar-exterior.jpg',
  ]);
  assert.ok(images.every((image) => image.getAttribute('alt') && image.getAttribute('width') && image.getAttribute('height')));
  assert.equal(images.filter((image) => image.getAttribute('loading') === 'lazy').length, 3);

  const visit = main.querySelector('#visit');
  assert.match(visit?.textContent || '', /1114 E\. 4th Street, Reno, NV 89512/);
  assert.match(visit?.textContent || '', /Daily, 12:00 p\.m\.–2:00 a\.m\./);
  assert.equal(visit?.querySelectorAll('a').length, 1);
  assert.ok(visit?.querySelector('a[href^="https://www.google.com/maps/"]'));
  assert.doesNotMatch(visit?.textContent || '', /Official bar website/i);
  assert.match(visit?.textContent || '', /Holiday hours may vary/);
  assert.equal(main.querySelector('.home-pathway--community a[href="/community"]')?.textContent.trim(), 'Browse the community');
  assert.equal(main.querySelector('.home-pathway--community a[href="/create-account"]')?.textContent.trim(), 'New to Hive?');
  assertSingleBoundedRead(fixture);
});

test('UX-1F empty and unavailable update states stay compact while retaining the useful homepage', async () => {
  for (const status of ['empty', 'unavailable']) {
    const fixture = createUx1fVisualFixture(status);
    const response = await request(fixture.app).get('/').expect(200);
    const document = documentFor(response.text);
    const main = document.querySelector('main[data-ux-1f-surface="home"]');
    const updates = main?.querySelector(`[data-home-updates-state="${status}"]`);

    assert.ok(updates, status);
    assert.equal(updates.querySelectorAll('.home-update').length, 0, status);
    assert.ok(updates.querySelector('.home-updates-note'), status);
    assert.equal(updates.querySelector('.state-card'), null, status);
    assert.ok(main.querySelector('a[href="/community"]'), status);
    assert.ok(main.querySelector('a[href="#visit"]'), status);
    assert.ok(main.querySelector('#visit a[href^="https://www.google.com/maps/"]'), status);
    assert.equal(main.querySelector('#visit a[href="https://4thstreetbarreno.com/"]'), null, status);
    assert.ok(main.querySelector('.home-gallery__grid'), status);
    assert.doesNotMatch(response.text, /UX-1F deterministic update outage/, status);
    if (status === 'unavailable') {
      assert.equal(updates.getAttribute('role'), null);
      assert.equal(updates.querySelector('.home-updates-note')?.getAttribute('role'), 'status');
      assert.match(updates.textContent, /temporarily unavailable/i);
    } else {
      assert.match(updates.textContent, /No official updates yet/);
    }
    assertSingleBoundedRead(fixture);
  }
});

test('UX-1F is a registered homepage-only presentation layer and preserves the fail-open route contract', () => {
  const indexSource = fs.readFileSync(path.join(ROOT, 'views/pages/home/index.ejs'), 'utf8');
  const headSource = fs.readFileSync(path.join(ROOT, 'views/common/head.ejs'), 'utf8');
  const routeSource = fs.readFileSync(path.join(ROOT, 'routes/index.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/ux-1f-home.css'), 'utf8');

  assert.match(indexSource, /assetUrl\('\/css\/ux-1f-home\.css'\)/);
  assert.doesNotMatch(headSource, /ux-1f-home\.css/);
  assert.ok(FIRST_PARTY_ASSETS.includes('/css/ux-1f-home.css'));
  assert.match(css, /\.home-hero\s*\{/);
  assert.match(css, /\.home-updates-note\s*\{/);
  assert.match(css, /\.home-pathways__grid\s*\{/);
  assert.match(css, /\.home-gallery__grid\s*\{/);
  assert.doesNotMatch(css, /@import\s+url\(/i);
  assert.doesNotMatch(css, /https?:\/\//i);

  assert.equal((routeSource.match(/getOfficialCommunityPosts\(/g) || []).length, 1);
  assert.match(routeSource, /account:\s*config\.hive\.officialBarAccount/);
  assert.match(routeSource, /community:\s*config\.hive\.communityId/);
  assert.match(routeSource, /limit:\s*3/);
  assert.match(routeSource, /status:\s*items\.length > 0 \? 'ready' : 'empty'/);
  assert.match(routeSource, /status:\s*'unavailable'/);
});

test('UX-1F remains read-only while C2-A beta profile exposure leaves V1, payment, and signer policy inactive', async () => {
  const fixture = createUx1fVisualFixture('empty');
  const response = await request(fixture.app).get('/').expect(200);
  const document = documentFor(response.text);

  assert.deepEqual(BETA_ACTIONS, EXPECTED_BETA_ACTIONS);
  assert.equal(BETA_ACTIONS.includes('thread'), true);
  assert.equal(BETA_ACTIONS.includes('profile'), true);
  assert.equal(V1_ACTIONS.length, 12);
  assert.equal(V1_ACTIONS.includes('profile'), true);
  assert.equal(fixture.config.hive.writeMode, 'disabled');
  assert.equal(fixture.config.hive.signerMode, 'disabled');
  assert.equal(fixture.config.hive.betaSelfSigningEnabled, false);
  assert.equal(fixture.config.hive.v1SelfSigningEnabled, false);
  assert.equal(fixture.config.payments.enabled, false);
  assert.equal(fixture.config.distriator.enabled, false);
  assert.equal(document.querySelector('main form'), null);
  assertSingleBoundedRead(fixture);
});

test('UX-1F home document loads the scoped versioned asset without changing shared pages', async () => {
  const fixture = createUx1fVisualFixture('empty');
  const response = await request(fixture.app).get('/').expect(200);
  const document = documentFor(response.text);
  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'), (link) => assetPath(link.href));

  assert.deepEqual(stylesheets, ['/css/style.css', '/css/m15-social.css', '/css/ux-1f-home.css']);
  assertSingleBoundedRead(fixture);
});
