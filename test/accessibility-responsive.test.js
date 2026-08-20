'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const axe = require('axe-core');
const { HtmlValidate } = require('html-validate');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { createFixtureRpc } = require('./support/fixture-rpc');
const { configFrom, createFixtureApp, logger } = require('./support/test-app');

const KEY_ROUTES = [
  '/',
  '/community',
  '/post/etblink/welcome-fourth-street-bar',
  '/profile/etblink',
  '/profile/etblink/wallet',
  '/profile/etblink/wall-posts',
  '/profile/etblink/followers',
  '/profile/etblink/following',
  '/pay',
];

async function renderKeyRoutes() {
  const responses = [];
  for (const route of KEY_ROUTES) {
    const { app } = createFixtureApp();
    responses.push({ route, response: await request(app).get(route).expect(200) });
  }
  return responses;
}

async function renderControlledRoutes() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-bytes',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create('etblink');
  const cookie = `hive_bar_session=${token}`;
  const routes = [
    '/community',
    '/post/etblink/welcome-fourth-street-bar',
    '/profile/barfriend',
    '/profile/etblink/wallet',
    '/profile/etblink/wall-posts',
    '/profile/etblink/inbox',
    '/profile/etblink/settings',
    '/pay',
  ];
  const responses = [];
  for (const route of routes) {
    const app = createApp({ config, logger, rpcPool: createFixtureRpc(), sessionStore });
    responses.push({ route, response: await request(app).get(route).set('cookie', cookie).expect(200) });
  }
  return responses;
}

function messageSummary(report) {
  return report.results
    .flatMap((result) => result.messages)
    .map((message) => `${message.ruleId}: ${message.message} (${message.selector || 'document'})`)
    .join('\n');
}

test('key public documents pass structural HTML and accessibility validation', async () => {
  const validator = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: { 'no-trailing-whitespace': 'off' },
  });

  for (const { route, response } of await renderKeyRoutes()) {
    const report = await validator.validateString(response.text);
    assert.equal(report.valid, true, `${route}\n${messageSummary(report)}`);
  }
});

test('axe reports no serious or critical violations on key public documents', async () => {
  for (const { route, response } of await renderKeyRoutes()) {
    const dom = new JSDOM(response.text, {
      runScripts: 'outside-only',
      url: `https://hive-bar.test${route}`,
    });
    dom.window.eval(axe.source);
    const result = await dom.window.axe.run(dom.window.document, {
      resultTypes: ['violations'],
      rules: {
        'color-contrast': { enabled: false },
      },
    });
    dom.window.close();

    const blocking = result.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact),
    );
    const summary = blocking.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target),
      }));
    assert.equal(blocking.length, 0, `${route}\n${JSON.stringify(summary, null, 2)}`);
  }
});

test('controlled M3, M4, and M5 forms pass structural and serious/critical accessibility gates', async () => {
  const validator = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: { 'no-trailing-whitespace': 'off' },
  });

  for (const { route, response } of await renderControlledRoutes()) {
    const report = await validator.validateString(response.text);
    assert.equal(report.valid, true, `${route}\n${messageSummary(report)}`);

    const dom = new JSDOM(response.text, {
      runScripts: 'outside-only',
      url: `https://hive-bar.test${route}`,
    });
    dom.window.eval(axe.source);
    const result = await dom.window.axe.run(dom.window.document, {
      resultTypes: ['violations'],
      rules: { 'color-contrast': { enabled: false } },
    });
    dom.window.close();
    const blocking = result.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact),
    );
    assert.equal(
      blocking.length,
      0,
      `${route}\n${JSON.stringify(blocking.map((item) => item.id))}`,
    );
  }
});

test('key routes satisfy the automated 360 CSS-pixel responsive contract', async () => {
  for (const { route, response } of await renderKeyRoutes()) {
    const dom = new JSDOM(response.text);
    const { document } = dom.window;
    const viewport = document.querySelector('meta[name="viewport"]');
    assert.equal(viewport?.getAttribute('content'), 'width=device-width, initial-scale=1', route);
    assert.equal(document.querySelectorAll('main#main-content').length, 1, route);
    assert.ok(document.querySelector('header nav ul.flex-wrap'), route);

    for (const element of document.querySelectorAll('[width]')) {
      const width = Number(element.getAttribute('width'));
      if (Number.isFinite(width) && width > 360) {
        assert.equal(element.tagName, 'IMG', `${route}: fixed width ${width}`);
        assert.match(
          element.getAttribute('class') || '',
          /(?:^|\s)(?:w-full|max-w-full)(?:\s|$)/,
          `${route}: ${width}px intrinsic image must be explicitly responsive`,
        );
      }
    }
    assert.doesNotMatch(
      response.text,
      /\b(?:min-w|w)-\[(?:3[7-9]\d|[4-9]\d\d|\d{4,})px\]/,
      route,
    );
    dom.window.close();
  }

  const home = (await renderKeyRoutes())[0].response.text;
  assert.match(home, /class="home-pathways__grid"/);
  const homeCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'ux-1f-home.css'), 'utf8');
  assert.match(homeCss, /@media\s*\(min-width:\s*960px\)[\s\S]*?\.home-pathways__grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,/);
  const community = (await renderKeyRoutes())[1].response.text;
  assert.match(community, /grid-cols-1[^"\n]*lg:grid-cols/);
  const wallet = (await renderKeyRoutes())[4].response.text;
  assert.match(wallet, /grid[^"\n]*sm:grid-cols-3/);

  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'style.css'), 'utf8');
  assert.match(css, /@media\s*\(min-width:\s*40rem\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  );
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

test('M18 venue and status color pairs meet WCAG AA normal-text contrast', () => {
  const pairs = [
    ['#f4a460', '#080706'],
    ['#080706', '#f4a460'],
    ['#f7f1e8', '#11100f'],
    ['#c8bfb4', '#11100f'],
    ['#9b9085', '#11100f'],
    ['#8fb4e0', '#11100f'],
    ['#76b78a', '#11100f'],
    ['#f0b86b', '#11100f'],
    ['#f08a8a', '#11100f'],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(
      contrast(foreground, background) >= 4.5,
      `${foreground} on ${background} has contrast ${contrast(foreground, background).toFixed(2)}`,
    );
  }
});
