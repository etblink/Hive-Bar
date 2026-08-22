'use strict';
/* global document */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { ModerationService } = require('../src/moderation/moderation-service');
const { ModerationStore } = require('../src/moderation/moderation-store');
const { createStaticAssetUrl } = require('../src/release/static-assets');
const { configFrom, logger } = require('../test/support/test-app');
const { createC2eRpc } = require('../test/support/c2-e-fixture');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.C2_E_VISUAL_OUTPUT || 'artifacts/c2-e-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const WIDTHS = Object.freeze([390, 1440]);
const HEIGHT = 900;
const ACCOUNT = 'etblink';
const SCENARIOS = Object.freeze([
  { id: 'community-controls', fixture: 'seeded', path: '/community', openDialog: true },
  { id: 'threads-suppressed-branch', fixture: 'seeded', path: '/community/threads' },
  { id: 'conversation-suppressed-branch', fixture: 'seeded', path: '/post/visibleone/community-root' },
  { id: 'moderation-management', fixture: 'seeded', path: '/moderation' },
  { id: 'moderation-store-unavailable', fixture: 'unavailable', path: '/community', expectedStatus: 503 },
]);
const KEYCHAIN_STUB = `'use strict'; Object.defineProperty(window, '__C2_E_KEYCHAIN_DISABLED__', { value: true }); window.HiveBarKeychain = Object.freeze({ KeychainAdapter: class { async broadcast() { throw new Error('C2-E visual qualification forbids Keychain signing'); } async decodeMemo() { throw new Error('C2-E visual qualification forbids Keychain use'); } } });`;
const IMAGE_PLACEHOLDER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertSafeOutputRoot() {
  const relative = path.relative(ROOT, OUTPUT);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function createVisualFixture({ unavailable = false } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_MODERATION_ENABLED: 'true',
    HIVE_MODERATION_OPERATOR_ACCOUNTS: ACCOUNT,
    HIVE_MODERATION_DB_PATH: ':memory:',
    RATE_LIMIT_MAX: '10000',
    SESSION_SECRET: `c2-e-${unavailable ? 'unavailable' : 'seeded'}-visual-session-secret-32-bytes`,
  });
  const rpcPool = createC2eRpc();
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create(ACCOUNT);

  let moderationStore;
  let moderationService;
  if (unavailable) {
    moderationStore = { close() {} };
    const hiveReads = new (require('../src/hive/read-service').HiveReadService)(rpcPool);
    moderationService = new ModerationService({
      config,
      hiveReads,
      store: null,
      unavailableCause: new Error('C2-E visual fixture intentionally unavailable'),
    });
  } else {
    moderationStore = new ModerationStore({ filename: ':memory:' });
    moderationStore.hide({
      targetType: 'account',
      author: 'spammer',
      reason: 'Repeated unwanted Community content',
      operator: ACCOUNT,
    });
    moderationStore.hide({
      targetType: 'content',
      author: 'bob',
      permlink: 'hidden-exact-post',
      reason: 'Exact local presentation rule',
      operator: ACCOUNT,
    });
  }

  const application = createApp({
    config,
    logger,
    rpcPool,
    sessionStore,
    moderationStore,
    moderationService,
  });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));

  const mutationAttempts = [];
  const app = express();
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({ error: { code: 'C2_E_VISUAL_MUTATION_FORBIDDEN' } });
  });
  app.use(application);
  return { app, config, moderationStore, mutationAttempts, rpcPool, token };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

async function capture({ browser, baseUrl, scenario, token, width }) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    colorScheme: 'dark',
    locale: 'en-US',
  });
  const origin = new URL(baseUrl).origin;
  const outbound = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      outbound.push({ method: request.method(), resourceType: request.resourceType(), url: request.url() });
      if (request.resourceType() === 'image') {
        return route.fulfill({ status: 200, contentType: 'image/png', body: IMAGE_PLACEHOLDER });
      }
      return route.abort('blockedbyclient');
    }
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort('blockedbyclient');
    if (url.pathname === '/js/keychain-adapter.js') {
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: KEYCHAIN_STUB,
      });
    }
    return route.continue();
  });
  await context.addCookies([{
    name: 'hive_bar_session',
    value: token,
    url: baseUrl,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const response = await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), scenario.expectedStatus || 200);

  let focusReturned = null;
  if (scenario.openDialog) {
    const trigger = page.locator('[data-moderation-open]').first();
    await trigger.click();
    assert.equal(await page.locator('[data-moderation-dialog]').first().evaluate((node) => node.open), true);
    await page.locator('[data-moderation-cancel]').first().click();
    focusReturned = await trigger.evaluate((node) => document.activeElement === node);
    assert.equal(focusReturned, true);
    await trigger.click();
  }

  await page.addStyleTag({
    content: '*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}',
  });
  await page.evaluate(() => globalThis.document.fonts.ready);
  const evidence = await page.evaluate((scenarioId) => {
    const root = document.documentElement;
    const text = document.body.textContent || '';
    const dialog = document.querySelector('[data-moderation-dialog]');
    return {
      scenario: scenarioId,
      overflow: Math.max(0, root.scrollWidth - root.clientWidth),
      keychainDisabled: globalThis.__C2_E_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      moderationControls: document.querySelectorAll('[data-moderation-control]').length,
      dialogOpen: Boolean(dialog?.open),
      dialogDisclosure: text.includes('does not delete, edit, flag, or otherwise change anything on Hive'),
      dialogTargetLabel: Boolean(document.querySelector('[data-moderation-open][aria-label*="Moderate"]')),
      reasonHelp: text.includes('Maximum 240 UTF-8 bytes'),
      visibleCommunity: text.includes('Visible community conversation'),
      hiddenAccountPost: text.includes('Hidden account post'),
      hiddenExactPost: text.includes('Hidden exact post'),
      visibleThread: text.includes('Visible Thread survives moderation.'),
      visibleThreadSibling: text.includes('Visible sibling Thread remains.'),
      hiddenThread: text.includes('Hidden Thread parent must not render.'),
      hiddenThreadChild: text.includes('Descendant of hidden Thread must not render.'),
      visibleReply: text.includes('Visible sibling reply remains.'),
      hiddenReply: text.includes('Hidden reply must not render.'),
      hiddenReplyChild: text.includes('Descendant of hidden reply must not render.'),
      managementDisclosure: text.includes('Hive content remains unchanged and independently available on Hive.'),
      activeAccountRule: text.includes('Account rule') && text.includes('@spammer'),
      activeExactRule: text.includes('Exact content rule') && text.includes('@bob/hidden-exact-post'),
      auditHistory: text.includes('Audit history') && text.includes('Hidden'),
      unhideLabel: Boolean(document.querySelector('[data-moderation-unhide] button[aria-label^="Unhide"]')),
      unavailable: text.includes('Community moderation is temporarily unavailable'),
    };
  }, scenario.id);

  assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
  assert.equal(evidence.keychainDisabled, true);
  assert.equal(evidence.nativeKeychain, false);

  if (scenario.id === 'community-controls') {
    assert.ok(evidence.moderationControls >= 1);
    assert.equal(evidence.dialogOpen, true);
    assert.equal(evidence.dialogDisclosure, true);
    assert.equal(evidence.dialogTargetLabel, true);
    assert.equal(evidence.reasonHelp, true);
    assert.equal(evidence.visibleCommunity, true);
    assert.equal(evidence.hiddenAccountPost, false);
    assert.equal(evidence.hiddenExactPost, false);
  }
  if (scenario.id === 'threads-suppressed-branch') {
    assert.equal(evidence.visibleThread, true);
    assert.equal(evidence.visibleThreadSibling, true);
    assert.equal(evidence.hiddenThread, false);
    assert.equal(evidence.hiddenThreadChild, false);
  }
  if (scenario.id === 'conversation-suppressed-branch') {
    assert.equal(evidence.visibleCommunity, true);
    assert.equal(evidence.visibleReply, true);
    assert.equal(evidence.hiddenReply, false);
    assert.equal(evidence.hiddenReplyChild, false);
  }
  if (scenario.id === 'moderation-management') {
    assert.equal(evidence.managementDisclosure, true);
    assert.equal(evidence.activeAccountRule, true);
    assert.equal(evidence.activeExactRule, true);
    assert.equal(evidence.auditHistory, true);
    assert.equal(evidence.unhideLabel, true);
  }
  if (scenario.id === 'moderation-store-unavailable') {
    assert.equal(evidence.unavailable, true);
  }

  const unexpectedConsoleErrors = scenario.expectedStatus === 503
    ? consoleErrors.filter((message) => !/Failed to load resource: the server responded with a status of 503/i.test(message))
    : consoleErrors;
  assert.deepEqual(unexpectedConsoleErrors, []);

  const filename = path.join(SHOTS, `${String(width).padStart(4, '0')}-${scenario.id}.png`);
  const bytes = await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
  await context.close();
  return {
    scenario: scenario.id,
    fixture: scenario.fixture,
    width,
    path: path.relative(OUTPUT, filename).split(path.sep).join('/'),
    sha256: sha256(bytes),
    focusReturned,
    evidence,
    consoleErrors,
    outboundBlockedOrSubstituted: outbound,
  };
}

async function main() {
  assertSafeOutputRoot();
  const fixtures = {
    seeded: createVisualFixture(),
    unavailable: createVisualFixture({ unavailable: true }),
  };
  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const servers = {
    seeded: await listen(fixtures.seeded.app),
    unavailable: await listen(fixtures.unavailable.app),
  };
  const baseUrls = Object.fromEntries(Object.entries(servers).map(([name, server]) => [
    name,
    `http://127.0.0.1:${server.address().port}`,
  ]));
  const browser = await chromium.launch({ headless: true });
  const manifest = {
    schemaVersion: 1,
    result: 'running',
    git: { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') },
    widths: WIDTHS,
    scenarios: SCENARIOS.map(({ id }) => id),
    captures: [],
  };
  try {
    for (const width of WIDTHS) {
      for (const scenario of SCENARIOS) {
        const fixture = fixtures[scenario.fixture];
        manifest.captures.push(await capture({
          browser,
          baseUrl: baseUrls[scenario.fixture],
          scenario,
          token: fixture.token,
          width,
        }));
      }
    }
    for (const fixture of Object.values(fixtures)) {
      assert.deepEqual(fixture.mutationAttempts, []);
    }
    manifest.result = 'pass';
  } finally {
    await browser.close();
    await Promise.all(Object.values(servers).map((server) => new Promise((resolve) => server.close(resolve))));
    fixtures.seeded.moderationStore.close?.();
    fixtures.unavailable.moderationStore.close?.();
  }
  await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`C2-E visual acceptance PASS: ${manifest.captures.length} captures\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
