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
const { createStaticAssetUrl } = require('../src/release/static-assets');
const { configFrom, logger } = require('../test/support/test-app');
const { createUx1aRpc } = require('../test/support/ux-1a-fixture');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.UX_1A_VISUAL_OUTPUT || 'artifacts/ux-1a-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const WIDTHS = Object.freeze([390, 1440]);
const HEIGHT = 900;
const ACCOUNT = 'etblink';
const SCENARIOS = Object.freeze([
  { id: 'community-posts', fixture: 'populated', path: '/community' },
  { id: 'threads-empty', fixture: 'empty', path: '/community/threads' },
  {
    id: 'thread-composer-active',
    fixture: 'empty',
    path: '/community/threads',
    composerValue: 'Anyone up for a game of pool tonight?',
  },
  { id: 'threads-populated', fixture: 'populated', path: '/community/threads' },
]);
const KEYCHAIN_STUB = `'use strict'; Object.defineProperty(window, '__UX_1A_KEYCHAIN_DISABLED__', { value: true }); window.HiveBarKeychain = Object.freeze({ KeychainAdapter: class { async broadcast() { throw new Error('UX-1A visual qualification forbids Keychain signing'); } async decodeMemo() { throw new Error('UX-1A visual qualification forbids Keychain use'); } } });`;
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

function createVisualFixture({ populated }) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    RATE_LIMIT_MAX: '10000',
    SESSION_SECRET: `ux-1a-${populated ? 'populated' : 'empty'}-visual-session-secret-32-bytes`,
  });
  const rpcPool = createUx1aRpc({ populated });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create(ACCOUNT);
  const application = createApp({ config, logger, rpcPool, sessionStore });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  const mutationAttempts = [];
  const app = express();
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({ error: { code: 'UX_1A_VISUAL_MUTATION_FORBIDDEN' } });
  });
  app.use(application);
  return { app, config, mutationAttempts, rpcPool, token };
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
      outbound.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
      if (request.resourceType() === 'image') {
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: IMAGE_PLACEHOLDER,
        });
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
  assert.equal(response.status(), 200);
  if (scenario.composerValue) {
    await page.locator('#new-thread-body').fill(scenario.composerValue);
    await page.locator('#new-thread-body').focus();
  }
  await page.addStyleTag({
    content: '*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}',
  });
  await page.evaluate(() => globalThis.document.fonts.ready);
  const evidence = await page.evaluate((scenarioId) => {
    const root = document.documentElement;
    const text = document.body.textContent;
    const composer = document.querySelector('form[data-social-action="thread"]');
    return {
      scenario: scenarioId,
      overflow: Math.max(0, root.scrollWidth - root.clientWidth),
      keychainDisabled: globalThis.__UX_1A_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      ordinaryPost: text.includes('Ordinary community post remains visible'),
      unrelatedSameAuthor: text.includes('Legitimate update from the Threads account'),
      technicalContainer: text.includes('Technical Threads Container — Do Not Display'),
      technicalParentLink: text.includes('View the parent post'),
      composer: Boolean(composer),
      signerMode: composer?.dataset.signerMode || null,
      composerValue: document.querySelector('#new-thread-body')?.value || '',
      byteCounter: document.querySelector('#new-thread-counter')?.textContent.trim() || '',
      emptyState: text.includes('No threads yet'),
      populatedThread: text.includes('Who is stopping by the bar tonight?'),
      populatedReply: text.includes('I will be there after work.'),
    };
  }, scenario.id);
  assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
  assert.equal(evidence.keychainDisabled, true);
  assert.equal(evidence.nativeKeychain, false);
  assert.equal(evidence.technicalContainer, false);
  assert.equal(evidence.technicalParentLink, false);
  if (scenario.id === 'community-posts') {
    assert.equal(evidence.ordinaryPost, true);
    assert.equal(evidence.unrelatedSameAuthor, true);
  }
  if (scenario.id === 'threads-empty') {
    assert.equal(evidence.composer, true);
    assert.equal(evidence.emptyState, true);
  }
  if (scenario.id === 'thread-composer-active') {
    assert.equal(evidence.composer, true);
    assert.equal(evidence.composerValue, scenario.composerValue);
    assert.equal(evidence.byteCounter, '37 / 500 used');
  }
  if (scenario.id === 'threads-populated') {
    assert.equal(evidence.composer, true);
    assert.equal(evidence.populatedThread, true);
    assert.equal(evidence.populatedReply, true);
  }
  if (evidence.composer) assert.equal(evidence.signerMode, 'keychain');
  assert.deepEqual(consoleErrors, []);
  const filename = path.join(
    SHOTS,
    `${String(width).padStart(4, '0')}-${scenario.id}.png`,
  );
  const bytes = await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
  await context.close();
  return {
    scenario: scenario.id,
    fixture: scenario.fixture,
    width,
    path: path.relative(OUTPUT, filename).split(path.sep).join('/'),
    sha256: sha256(bytes),
    evidence,
    outboundBlockedOrSubstituted: outbound,
  };
}

async function main() {
  assertSafeOutputRoot();
  const fixtures = {
    empty: createVisualFixture({ populated: false }),
    populated: createVisualFixture({ populated: true }),
  };
  for (const fixture of Object.values(fixtures)) {
    assert.equal(fixture.config.hive.writeMode, 'beta');
    assert.equal(fixture.config.hive.signerMode, 'keychain');
  }
  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const servers = {
    empty: await listen(fixtures.empty.app),
    populated: await listen(fixtures.populated.app),
  };
  const baseUrls = Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      `http://127.0.0.1:${server.address().port}`,
    ]),
  );
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
    assert.equal(manifest.captures.length, WIDTHS.length * SCENARIOS.length);
    for (const fixture of Object.values(fixtures)) {
      assert.deepEqual(fixture.mutationAttempts, []);
    }
    manifest.result = 'passed';
  } catch (error) {
    manifest.result = 'failed';
    manifest.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    manifest.rpcCalls = Object.fromEntries(
      Object.entries(fixtures).map(([name, fixture]) => [name, fixture.rpcPool.calls]),
    );
    manifest.mutationAttempts = Object.fromEntries(
      Object.entries(fixtures).map(([name, fixture]) => [name, fixture.mutationAttempts]),
    );
    await fs.writeFile(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await browser.close().catch(() => {});
    await Promise.all(
      Object.values(servers).map(
        (server) => new Promise((resolve) => server.close(resolve)),
      ),
    );
  }
  process.stdout.write(`${JSON.stringify({
    result: manifest.result,
    captures: manifest.captures.length,
    widths: WIDTHS,
    output: path.relative(ROOT, OUTPUT),
  })}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
