'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { chromium } = require('playwright');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { HiveReadService } = require('../src/hive/read-service');
const { createStaticAssetUrl } = require('../src/release/static-assets');
const { configFrom, logger } = require('../test/support/test-app');
const { createFixtureRpc } = require('../test/support/fixture-rpc');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.M18_4_VISUAL_OUTPUT || 'artifacts/m18-4-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const ACCOUNT = 'etblink';
const WIDTHS = Object.freeze([390, 768, 1440]);
const HEIGHT = 900;
const SCENARIOS = Object.freeze([
  { id: 'followers-empty', path: `/profile/${ACCOUNT}/followers`, authenticated: false },
  { id: 'following-empty', path: `/profile/${ACCOUNT}/following`, authenticated: false },
  { id: 'community-composer', path: '/community', authenticated: true },
  { id: 'conversation-reply', path: '/post/etblink/welcome-fourth-street-bar', authenticated: true },
  { id: 'wallet', path: `/profile/${ACCOUNT}/wallet`, authenticated: false },
  { id: 'inbox-owner', path: `/profile/${ACCOUNT}/inbox`, authenticated: true },
  { id: 'settings-owner', path: `/profile/${ACCOUNT}/settings`, authenticated: true },
]);
const KEYCHAIN_STUB = `'use strict'; Object.defineProperty(window, '__M18_4_KEYCHAIN_DISABLED__', { value: true }); window.HiveBarKeychain = Object.freeze({ KeychainAdapter: class { async broadcast() { throw new Error('M18.4 visual qualification forbids Keychain signing'); } async decodeMemo() { throw new Error('M18.4 visual qualification forbids Keychain use'); } } });`;
const IMAGE_PLACEHOLDER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

function git(...args) { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

function createFixture() {
  const config = configFrom({ HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain', RATE_LIMIT_MAX: '10000', SESSION_SECRET: 'm18-4-visual-session-secret-32-bytes-minimum' });
  const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
  const { token } = sessionStore.create(ACCOUNT);
  const rpcPool = createFixtureRpc();
  const baseReads = new HiveReadService(rpcPool);
  const readCalls = [];
  const hiveReadService = new Proxy(baseReads, {
    get(target, property, receiver) {
      if (property === 'getFollowers' || property === 'getFollowing') {
        return async (account, cursor) => {
          readCalls.push({ method: property, account, cursor: cursor || null });
          return { items: [], nextCursor: null };
        };
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return async (...args) => {
        readCalls.push({ method: property, args });
        return value.apply(target, args);
      };
    },
  });
  const application = createApp({ config, logger, rpcPool, hiveReadService, sessionStore });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  const mutationAttempts = [];
  const app = express();
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({ error: { code: 'M18_4_VISUAL_MUTATION_FORBIDDEN' } });
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

async function capture({ browser, baseUrl, scenario, token, width }) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHT }, colorScheme: 'dark', locale: 'en-US' });
  const origin = new URL(baseUrl).origin;
  const outbound = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      outbound.push({ method: request.method(), resourceType: request.resourceType(), url: request.url() });
      if (request.resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: IMAGE_PLACEHOLDER });
      return route.abort('blockedbyclient');
    }
    if (!['GET', 'HEAD'].includes(request.method())) return route.abort('blockedbyclient');
    if (url.pathname === '/js/keychain-adapter.js') return route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: KEYCHAIN_STUB });
    return route.continue();
  });
  if (scenario.authenticated) await context.addCookies([{ name: 'hive_bar_session', value: token, url: baseUrl, httpOnly: true, sameSite: 'Lax' }]);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const response = await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.addStyleTag({ content: '*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}' });
  await page.evaluate(() => globalThis.document.fonts.ready);
  const evidence = await page.evaluate((id) => {
    const root = document.documentElement;
    return {
      id,
      overflow: Math.max(0, root.scrollWidth - root.clientWidth),
      keychainDisabled: globalThis.__M18_4_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      byteLimitCopy: document.body.textContent.includes('byte limit'),
      communityComposer: Boolean(document.querySelector('form[data-social-action="post"]')),
      replyComposer: Boolean(document.querySelector('form[data-social-action="comment"]')),
      wallet: document.body.textContent.includes('cannot move funds'),
      inbox: document.body.textContent.includes('Your encrypted inbox'),
      settings: document.body.textContent.includes('Profile and message settings'),
      emptyFollowers: document.body.textContent.includes('This account has no followers yet.'),
      emptyFollowing: document.body.textContent.includes('This account is not following anyone yet.'),
    };
  }, scenario.id);
  assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
  assert.equal(evidence.keychainDisabled, true);
  assert.equal(evidence.nativeKeychain, false);
  assert.equal(evidence.byteLimitCopy, false);
  if (scenario.id === 'community-composer') assert.equal(evidence.communityComposer, true);
  if (scenario.id === 'conversation-reply') assert.equal(evidence.replyComposer, true);
  if (scenario.id === 'wallet') assert.equal(evidence.wallet, true);
  if (scenario.id === 'inbox-owner') assert.equal(evidence.inbox, true);
  if (scenario.id === 'settings-owner') assert.equal(evidence.settings, true);
  if (scenario.id === 'followers-empty') assert.equal(evidence.emptyFollowers, true);
  if (scenario.id === 'following-empty') assert.equal(evidence.emptyFollowing, true);
  assert.deepEqual(consoleErrors, []);
  const filename = path.join(SHOTS, `${String(width).padStart(4, '0')}-${scenario.id}.png`);
  const bytes = await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
  await context.close();
  return { scenario: scenario.id, width, path: path.relative(OUTPUT, filename).split(path.sep).join('/'), sha256: sha256(bytes), evidence, outboundBlockedOrSubstituted: outbound };
}

async function main() {
  const current = createFixture();
  assert.equal(current.config.hive.writeMode, 'beta');
  assert.equal(current.config.hive.signerMode, 'keychain');
  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const server = await listen(current.app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const manifest = { schemaVersion: 1, result: 'running', git: { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') }, widths: WIDTHS, scenarios: SCENARIOS.map(({ id }) => id), captures: [] };
  try {
    for (const width of WIDTHS) for (const scenario of SCENARIOS) manifest.captures.push(await capture({ browser, baseUrl, scenario, token: current.token, width }));
    assert.equal(manifest.captures.length, WIDTHS.length * SCENARIOS.length);
    assert.deepEqual(current.mutationAttempts, []);
    manifest.result = 'passed';
  } catch (error) {
    manifest.result = 'failed';
    manifest.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    manifest.readCalls = current.readCalls;
    manifest.rpcCalls = current.rpcPool.calls;
    manifest.mutationAttempts = current.mutationAttempts;
    await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(JSON.stringify({ result: manifest.result, captures: manifest.captures.length, widths: WIDTHS, output: path.relative(ROOT, OUTPUT) }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
