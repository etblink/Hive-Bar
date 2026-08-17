'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const axe = require('axe-core');
const { HtmlValidate } = require('html-validate');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { BETA_ACTIONS, isBetaAction } = require('../src/beta/actions');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { BETA_SELF_ACTIONS, loadConfig } = require('../src/config');
const { assertPrivexBetaRelease } = require('../src/release/beta-readiness');
const { BETA_M16_4_ACTIONS } = require('../routes/m4');
const { BETA_M16_3_ACTIONS } = require('../routes/social');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';

function productionBetaSource(overrides = {}) {
  return {
    NODE_ENV: 'production',
    PORT: '3000',
    BIND_HOST: '127.0.0.1',
    HIVE_BAR_HOST: 'fourthstreetbar.com',
    SITE_NAME: '4th Street Bar',
    BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
    BAR_PHONE: '(775) 324-7827',
    BAR_HOURS: 'Daily, 12:00 p.m.–2:00 a.m.',
    BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
    BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=1114%20E.%204th%20Street%2C%20Reno%2C%20NV%2089512',
    HIVE_COMMUNITY_ID: 'hive-108590',
    HIVE_OFFICIAL_BAR_ACCOUNT: 'fourthstreetbar',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
    HIVE_RPC_NODES: 'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_CONTROLLED_ACTIONS: '',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_GLOBAL_WALL_EXCLUSIONS: '',
    HIVE_MESSAGE_HISTORY_PAGE_SIZE: '25',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS: '120000',
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
    HIVE_RPC_TIMEOUT_MS: '8000',
    HIVE_RPC_FAILURE_THRESHOLD: '2',
    HIVE_RPC_COOLDOWN_MS: '30000',
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '120',
    AUTH_RATE_LIMIT_MAX: '10',
    APP_ORIGIN: 'https://fourthstreetbar.com',
    SESSION_SECRET,
    SESSION_TTL_MS: '28800000',
    AUTH_CHALLENGE_TTL_MS: '300000',
    SOCIAL_PREFLIGHT_TTL_MS: '300000',
    TRUST_PROXY: 'loopback',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

function betaFixture({ account = 'etblink' } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_CONTROLLED_ACTIONS: '',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create(account);
  const app = createApp({ config, logger, rpcPool: createFixtureRpc(), sessionStore });
  return { app, config, token };
}

function messageSummary(report) {
  return report.results
    .flatMap((result) => result.messages)
    .map((message) => `${message.ruleId}: ${message.message} (${message.selector || 'document'})`)
    .join('\n');
}

test('M16.6 freezes one exact five-action beta manifest matching all accepted route lanes', () => {
  assert.deepEqual(BETA_ACTIONS, ['post', 'comment', 'vote', 'wall', 'inbox']);
  assert.equal(Object.isFrozen(BETA_ACTIONS), true);
  for (const action of BETA_ACTIONS) assert.equal(isBetaAction(action), true);
  for (const action of ['thread', 'follow', 'subscribe', 'profile', 'claim-rewards', 'payment']) {
    assert.equal(isBetaAction(action), false, action);
  }

  const acceptedLaneUnion = [...new Set([
    ...BETA_SELF_ACTIONS,
    ...BETA_M16_3_ACTIONS,
    ...BETA_M16_4_ACTIONS,
  ])].sort();
  assert.deepEqual(acceptedLaneUnion, [...BETA_ACTIONS].sort());
});

test('Privex beta release gate accepts only the reviewed production topology and inert legacy lanes', () => {
  const source = productionBetaSource();
  const config = loadConfig(source, { loadDotenv: false });
  const summary = assertPrivexBetaRelease(config, source);

  assert.equal(summary.profile, 'privex-beta-self-signing');
  assert.equal(summary.publicHost, 'fourthstreetbar.com');
  assert.equal(summary.origin, 'https://fourthstreetbar.com');
  assert.equal(summary.bindHost, '127.0.0.1');
  assert.equal(summary.port, 3000);
  assert.equal(summary.trustProxy, 'loopback');
  assert.equal(summary.writeMode, 'beta');
  assert.equal(summary.signerMode, 'keychain');
  assert.deepEqual(summary.betaActions, BETA_ACTIONS);
  assert.equal(summary.controlledAccountCount, 0);
  assert.equal(summary.controlledActionCount, 0);
  assert.equal(summary.paymentsEnabled, false);
  assert.equal(summary.distriatorEnabled, false);
  assert.equal(summary.rpcNodeCount, 3);
});

test('Privex beta release gate refuses controlled residue, payment-adjacent activation, or wrong topology', () => {
  for (const [overrides, pattern] of [
    [{ HIVE_CONTROLLED_ACCOUNTS: 'etblink' }, /HIVE_CONTROLLED_ACCOUNTS must be explicitly empty/],
    [{ HIVE_CONTROLLED_ACTIONS: 'post' }, /HIVE_CONTROLLED_ACTIONS must be explicitly empty/],
    [{ DISTRIATOR_ENABLED: 'true' }, /DISTRIATOR_ENABLED must be false/],
    [{ HIVE_BAR_HOST: 'www.fourthstreetbar.com', APP_ORIGIN: 'https://www.fourthstreetbar.com' }, /must be exactly fourthstreetbar\.com/],
    [{ TRUST_PROXY: 'false' }, /TRUST_PROXY must be exactly loopback/],
    [{ BIND_HOST: '0.0.0.0' }, /BIND_HOST must be 127\.0\.0\.1/],
    [{ HIVE_M10_OPERATOR_ARMED_UNTIL: '2099-01-01T00:00:00Z' }, /no M9\/M10\/M12/],
  ]) {
    const source = productionBetaSource(overrides);
    const config = loadConfig(source, { loadDotenv: false });
    assert.throws(() => assertPrivexBetaRelease(config, source), pattern);
  }

  assert.throws(
    () => loadConfig(productionBetaSource({ HIVE_SIGNER_MODE: 'disabled' }), { loadDotenv: false }),
    /Beta self-signing mode requires Hive Keychain/,
  );
});

test('signed-in beta desktop/mobile documents pass structural and serious accessibility gates', async () => {
  const fixture = betaFixture();
  const routes = [
    '/community',
    '/post/etblink/welcome-fourth-street-bar',
    '/profile/barfriend/wall-posts',
    '/profile/etblink/inbox',
    '/pay',
  ];
  const validator = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: { 'no-trailing-whitespace': 'off' },
  });

  for (const route of routes) {
    const response = await request(fixture.app)
      .get(route)
      .set('cookie', `hive_bar_session=${fixture.token}`)
      .expect(200);
    const report = await validator.validateString(response.text);
    assert.equal(report.valid, true, `${route}\n${messageSummary(report)}`);

    const dom = new JSDOM(response.text, {
      runScripts: 'outside-only',
      url: `https://hive-bar.test${route}`,
    });
    const viewport = dom.window.document.querySelector('meta[name="viewport"]');
    assert.equal(viewport?.getAttribute('content'), 'width=device-width, initial-scale=1', route);
    assert.equal(dom.window.document.querySelectorAll('main#main-content').length, 1, route);
    dom.window.eval(axe.source);
    const result = await dom.window.axe.run(dom.window.document, {
      resultTypes: ['violations'],
      rules: { 'color-contrast': { enabled: false } },
    });
    const blocking = result.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact),
    );
    dom.window.close();
    assert.equal(
      blocking.length,
      0,
      `${route}\n${JSON.stringify(blocking.map((item) => item.id))}`,
    );

    assert.doesNotMatch(
      response.text,
      /\b(?:min-w|w)-\[(?:3[7-9]\d|[4-9]\d\d|\d{4,})px\]/,
      route,
    );
  }

  const community = await request(fixture.app)
    .get('/community')
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .expect(200);
  assert.match(community.text, /data-social-action="post" data-signer-mode="keychain"/);
  assert.match(community.text, /data-social-action="vote"\s+data-signer-mode="keychain"/);
  assert.doesNotMatch(community.text, /data-social-action="subscribe"/);
  assert.doesNotMatch(community.text, /data-social-action="thread"/);

  const post = await request(fixture.app)
    .get('/post/etblink/welcome-fourth-street-bar')
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .expect(200);
  assert.match(post.text, /data-social-action="comment" data-signer-mode="keychain"/);
  assert.match(post.text, /data-social-action="vote"\s+data-signer-mode="keychain"/);

  const wallFixture = betaFixture({ account: 'barfriend' });
  const wall = await request(wallFixture.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', `hive_bar_session=${wallFixture.token}`)
    .expect(200);
  assert.match(wall.text, /data-m4-action="wall"/);
  assert.match(wall.text, /data-m4-action="inbox"/);
});

test('responsive shell and activation tooling retain explicit mobile, desktop, and rollback-safe boundaries', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'input.css'), 'utf8');
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(min-width:\s*640px\)/);
  assert.match(css, /@media\s*\(min-width:\s*1200px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

  const startup = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'start-privex.js'), 'utf8');
  assert.match(startup, /config\.hive\.writeMode === 'beta'/);
  assert.match(startup, /assertPrivexBetaRelease/);

  const deploy = fs.readFileSync(path.join(__dirname, '..', 'ops', 'privex', 'bin', 'hive-bar-deploy'), 'utf8');
  assert.match(deploy, /node scripts\/check-privex-release\.js/);
  assert.match(deploy, /"writeMode":"disabled"/);

  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts['release:check:beta'], 'node scripts/check-beta-release.js');
});
