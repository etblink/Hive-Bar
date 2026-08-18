'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const playwrightPackage = require('playwright/package.json');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { createStaticAssetUrl } = require('../src/release/static-assets');
const { configFrom, logger } = require('../test/support/test-app');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.M18_3_VISUAL_OUTPUT || 'artifacts/m18-3-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const ACCOUNT = 'etblink';
const NOW = Date.parse('2026-08-18T02:15:00Z');
const WIDTHS = Object.freeze([360, 390, 768, 1024, 1440, 1600]);
const HEIGHT = 900;
const SCENARIOS = Object.freeze([
  { id: 'home-signed-out', path: '/', authenticated: false },
  { id: 'wall-signed-out', path: `/profile/${ACCOUNT}/wall-posts`, authenticated: false },
  { id: 'wall-authenticated', path: `/profile/${ACCOUNT}/wall-posts`, authenticated: true },
  { id: 'wall-private-expanded', path: `/profile/${ACCOUNT}/wall-posts`, authenticated: true },
  { id: 'pay-signed-out', path: '/pay', authenticated: false },
  { id: 'pay-authenticated-ready', path: '/pay', authenticated: true },
  { id: 'pay-authenticated-receipt', path: '/pay', authenticated: true },
]);

const KEYCHAIN_STUB = `'use strict';
Object.defineProperty(window, '__M18_3_KEYCHAIN_DISABLED__', { value: true });
window.HiveBarKeychain = Object.freeze({
  KeychainAdapter: class {
    async broadcast() { throw new Error('M18.3 visual qualification forbids Keychain signing'); }
  }
});`;

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createFixture() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_CONTROLLED_ACCOUNTS: ACCOUNT,
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    SESSION_SECRET: 'm18-3-visual-fixture-session-secret-32-bytes',
    RATE_LIMIT_MAX: '10000',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
    now: () => NOW,
  });
  const { token } = sessionStore.create(ACCOUNT);
  const rpcPool = {
    calls: [],
    getStatus: () => [],
    async call(api, method, params) {
      this.calls.push({ api, method, params });
      throw new Error(`M18.3 visual fixture forbids Hive RPC: ${api}.${method}`);
    },
  };
  const readCalls = [];
  const hiveReadService = {
    async getOfficialCommunityPosts(options) {
      readCalls.push({ method: 'getOfficialCommunityPosts', options });
      return [
        {
          author: 'fourthstreetbar',
          permlink: 'patio-evening',
          title: 'A good evening for the patio',
          excerpt: 'The patio is open and the lights are on. Come by or join the conversation online.',
        },
        {
          author: 'fourthstreetbar',
          permlink: 'pool-table-ready',
          title: 'The pool table is ready',
          excerpt: 'A quick update from inside 4th Street Bar.',
        },
      ];
    },
    async getProfile(account) {
      readCalls.push({ method: 'getProfile', account });
      assert.equal(account, ACCOUNT);
      return {
        name: ACCOUNT,
        displayName: 'Evan',
        about: 'Building the 4th Street Bar community.',
        profileImage: '/images/fourth-street-bar-logo.jpg',
        followerCount: 42,
        followingCount: 17,
        postCount: 123,
        reputation: '68.4',
      };
    },
    async getProfileSettings(account) {
      readCalls.push({ method: 'getProfileSettings', account });
      assert.equal(account, ACCOUNT);
      return { wallFee: '1.000 HBD', blocklist: [] };
    },
    async getMessageHistory(options) {
      readCalls.push({ method: 'getMessageHistory', options });
      assert.equal(options.account, ACCOUNT);
      assert.equal(options.kind, 'wall');
      return {
        items: [
          {
            sender: 'barfriend',
            amount: '1.000 HBD',
            message: 'Pool table is open and the patio looks great tonight.',
            timestamp: '2026-08-17T23:10:00',
            blockNumber: 98765432,
            transactionId: 'a'.repeat(40),
          },
          {
            sender: 'etblink',
            amount: '1.000 HBD',
            message: 'Welcome to the wall. Pull up a stool and say hello.',
            timestamp: '2026-08-17T22:45:00',
            blockNumber: 98765321,
            transactionId: 'b'.repeat(40),
          },
        ],
        nextCursor: null,
      };
    },
  };

  const application = createApp({ config, logger, now: () => NOW, rpcPool, hiveReadService, sessionStore });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  application.locals.currentYear = new Date(NOW).getUTCFullYear();

  const mutationAttempts = [];
  const app = express();
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({ error: { code: 'M18_3_VISUAL_MUTATION_FORBIDDEN' } });
  });
  app.use(application);
  return { app, config, mutationAttempts, readCalls, rpcPool, token };
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

async function settle(page) {
  await page.addStyleTag({ content: '*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}' });
  await page.evaluate(async () => {
    await globalThis.document.fonts.ready;
    await Promise.all(Array.from(globalThis.document.images, (image) => image.complete ? Promise.resolve() : image.decode()));
    await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
  });
}

async function prepare(page, id) {
  if (id === 'wall-private-expanded') {
    await page.locator('[data-m18-private-composer] > summary').click();
    assert.equal(await page.locator('[data-m18-private-composer]').evaluate((node) => node.open), true);
  }
  if (id === 'pay-authenticated-receipt') {
    await page.evaluate(() => {
      const receipt = globalThis.document.querySelector('[data-pay-receipt]');
      receipt.hidden = false;
      receipt.querySelector('[data-pay-receipt-state]').textContent = 'Confirmation pending';
      receipt.querySelector('[data-pay-receipt-account]').textContent = '@etblink';
      receipt.querySelector('[data-pay-receipt-merchant]').textContent = '@fourthstreetbar';
      receipt.querySelector('[data-pay-receipt-amount]').textContent = '1.000 HBD';
      receipt.querySelector('[data-pay-receipt-block]').textContent = 'Pending';
      receipt.querySelector('[data-pay-receipt-transaction]').textContent = 'a'.repeat(80);
      receipt.querySelector('[data-pay-receipt-fingerprint]').textContent = `sha256:${'b'.repeat(64)}`;
      receipt.querySelector('[data-pay-receipt-message]').textContent = 'Keychain accepted the payment. Waiting for independent Hive confirmation.';
      receipt.querySelector('[data-pay-recheck]').hidden = false;
    });
  }
  await settle(page);
}

async function evidence(page, scenario, width) {
  const result = await page.evaluate(({ scenarioId, widthValue }) => {
    const root = globalThis.document.documentElement;
    const visible = (node) => {
      const style = globalThis.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const outsideFocusables = Array.from(globalThis.document.querySelectorAll('a[href],button,input,textarea,select,summary'))
      .filter(visible)
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.left < -1 || rect.right > globalThis.innerWidth + 1).length;
    const undersizedButtonsAndSummaries = Array.from(globalThis.document.querySelectorAll('button,[data-m18-private-composer] > summary'))
      .filter(visible)
      .map((node) => ({ text: node.textContent.trim(), rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.height < 44 || rect.width < 44)
      .map(({ text, rect }) => ({ text, width: rect.width, height: rect.height }));
    const receipt = globalThis.document.querySelector('[data-pay-receipt]');
    const receiptOverflow = receipt && visible(receipt) ? Math.max(0, receipt.scrollWidth - receipt.clientWidth) : 0;
    return {
      scenarioId,
      width: widthValue,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      outsideFocusables,
      undersizedButtonsAndSummaries,
      receiptOverflow,
      home: Boolean(globalThis.document.querySelector('[data-m18-3-surface="home"]')),
      wall: Boolean(globalThis.document.querySelector('[data-m18-3-surface="wall"]')),
      pay: Boolean(globalThis.document.querySelector('[data-m18-3-surface="pay"]')),
      publicComposer: Boolean(globalThis.document.querySelector('form[data-m4-action="wall"]')),
      privateComposer: Boolean(globalThis.document.querySelector('form[data-m4-action="inbox"]')),
      privateExpanded: Boolean(globalThis.document.querySelector('[data-m18-private-composer]')?.open),
      payForm: Boolean(globalThis.document.querySelector('[data-pay-form]')),
      payReceiptVisible: Boolean(receipt && visible(receipt)),
      keychainStub: globalThis.__M18_3_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
    };
  }, { scenarioId: scenario.id, widthValue: width });

  assert.ok(result.horizontalOverflow <= 1, JSON.stringify(result));
  assert.equal(result.outsideFocusables, 0, JSON.stringify(result));
  assert.deepEqual(result.undersizedButtonsAndSummaries, [], JSON.stringify(result));
  assert.ok(result.receiptOverflow <= 1, JSON.stringify(result));
  assert.equal(result.keychainStub, true);
  assert.equal(result.nativeKeychain, false);

  if (scenario.id === 'home-signed-out') assert.equal(result.home, true);
  if (scenario.id.startsWith('wall-')) assert.equal(result.wall, true);
  if (scenario.id === 'wall-signed-out') {
    assert.equal(result.publicComposer, false);
    assert.equal(result.privateComposer, false);
  }
  if (scenario.id === 'wall-authenticated') {
    assert.equal(result.publicComposer, true);
    assert.equal(result.privateComposer, true);
    assert.equal(result.privateExpanded, false);
  }
  if (scenario.id === 'wall-private-expanded') assert.equal(result.privateExpanded, true);
  if (scenario.id.startsWith('pay-')) assert.equal(result.pay, true);
  if (scenario.id === 'pay-signed-out') assert.equal(result.payForm, false);
  if (scenario.id === 'pay-authenticated-ready') assert.equal(result.payForm, true);
  if (scenario.id === 'pay-authenticated-receipt') assert.equal(result.payReceiptVisible, true);

  if (width < 1200) {
    await page.evaluate(() => globalThis.scrollTo(0, globalThis.document.documentElement.scrollHeight));
    await page.waitForTimeout(20);
    const footer = await page.evaluate(() => {
      const line = globalThis.document.querySelector('.app-footer p:last-child').getBoundingClientRect();
      const nav = globalThis.document.querySelector('.app-primary-nav').getBoundingClientRect();
      return { footerLineBottom: line.bottom, navigationTop: nav.top };
    });
    assert.ok(footer.footerLineBottom <= footer.navigationTop + 1, JSON.stringify(footer));
    await page.evaluate(() => globalThis.scrollTo(0, 0));
  }
  return result;
}

async function capture({ browser, baseUrl, scenario, token, width }) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
  });
  const violations = [];
  const origin = new URL(baseUrl).origin;
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      violations.push({ reason: 'outbound-origin', url: request.url() });
      return route.abort('blockedbyclient');
    }
    if (!['GET', 'HEAD'].includes(request.method())) {
      violations.push({ reason: 'mutation-method', method: request.method(), url: request.url() });
      return route.abort('blockedbyclient');
    }
    if (url.pathname === '/js/keychain-adapter.js') {
      return route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: KEYCHAIN_STUB });
    }
    return route.continue();
  });
  if (scenario.authenticated) {
    await context.addCookies([{ name: 'hive_bar_session', value: token, url: baseUrl, httpOnly: true, sameSite: 'Lax' }]);
  }
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const response = await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await settle(page);
  await prepare(page, scenario.id);
  const pageEvidence = await evidence(page, scenario, width);
  assert.deepEqual(violations, []);
  assert.deepEqual(consoleErrors, []);
  const filename = path.join(SHOTS, `${String(width).padStart(4, '0')}-${scenario.id}.png`);
  const bytes = await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
  await context.close();
  return {
    scenario: scenario.id,
    width,
    path: path.relative(OUTPUT, filename).split(path.sep).join('/'),
    sha256: sha256(bytes),
    evidence: pageEvidence,
  };
}

async function main() {
  const current = createFixture();
  assert.equal(current.config.hive.writeMode, 'controlled');
  assert.equal(current.config.hive.signerMode, 'keychain');
  assert.equal(current.config.payments.enabled, true);

  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const server = await listen(current.app);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const manifest = {
    schemaVersion: 1,
    result: 'running',
    git: { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') },
    runtime: {
      node: process.version,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      playwright: playwrightPackage.version,
      chromium: browser.version(),
    },
    widths: WIDTHS,
    scenarios: SCENARIOS.map(({ id }) => id),
    captures: [],
  };

  try {
    for (const width of WIDTHS) {
      for (const scenario of SCENARIOS) {
        manifest.captures.push(await capture({ browser, baseUrl, scenario, token: current.token, width }));
      }
    }
    assert.equal(manifest.captures.length, WIDTHS.length * SCENARIOS.length);
    assert.deepEqual(current.mutationAttempts, []);
    assert.deepEqual(current.rpcPool.calls, []);
    manifest.result = 'passed';
  } catch (error) {
    manifest.result = 'failed';
    manifest.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    manifest.readCalls = current.readCalls;
    manifest.mutationAttempts = current.mutationAttempts;
    manifest.rpcCalls = current.rpcPool.calls;
    await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(JSON.stringify({
    result: manifest.result,
    captures: manifest.captures.length,
    widths: manifest.widths,
    browser: manifest.runtime.chromium,
    output: path.relative(ROOT, OUTPUT),
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});