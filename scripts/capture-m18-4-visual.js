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
const OUTPUT = path.resolve(ROOT, process.env.M18_4_VISUAL_OUTPUT || 'artifacts/m18-4-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const ACCOUNT = 'etblink';
const NOW = Date.parse('2026-08-18T09:00:00Z');
const WIDTHS = Object.freeze([360, 390, 768, 1024, 1440, 1600]);
const HEIGHT = 900;
const IMAGE_READY_TIMEOUT_MS = 5000;
const SCENARIOS = Object.freeze([
  { id: 'followers-empty', path: `/profile/${ACCOUNT}/followers`, authenticated: false },
  { id: 'following-empty', path: `/profile/${ACCOUNT}/following`, authenticated: false },
  { id: 'community-composer', path: '/community', authenticated: true },
  { id: 'post-reply-composer', path: `/post/${ACCOUNT}/welcome-fourth-street-bar`, authenticated: true },
  { id: 'wallet', path: `/profile/${ACCOUNT}/wallet`, authenticated: true },
  { id: 'inbox-settings-inbox', path: `/profile/${ACCOUNT}/inbox`, authenticated: true },
  { id: 'inbox-settings-settings', path: `/profile/${ACCOUNT}/settings`, authenticated: true },
]);

const KEYCHAIN_STUB = `'use strict';
Object.defineProperty(window, '__M18_4_KEYCHAIN_DISABLED__', { value: true });
window.HiveBarKeychain = Object.freeze({
  KeychainAdapter: class M18FourDisabledKeychainAdapter {
    constructor() {
      throw new Error('M18.4 visual qualification forbids Keychain access');
    }
  }
});`;

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function profile() {
  return {
    name: ACCOUNT,
    displayName: 'Evan',
    about: 'Building the 4th Street Bar community.',
    profileImage: '/images/fourth-street-bar-logo.jpg',
    followerCount: 0,
    followingCount: 0,
    postCount: 123,
    reputation: '68.4',
  };
}

function barfriendProfile() {
  return {
    name: 'barfriend',
    displayName: 'Bar Friend',
    about: 'A regular at the online bar.',
    profileImage: '/images/fourth-street-bar-logo.jpg',
    followerCount: 3,
    followingCount: 4,
    postCount: 5,
    reputation: '45.0',
  };
}

function fixturePost() {
  return {
    author: ACCOUNT,
    permlink: 'welcome-fourth-street-bar',
    title: 'Welcome to the 4th Street Bar community',
    excerpt: 'Pull up a stool and join the conversation.',
    bodyHtml: '<p>Pull up a stool and join the conversation at 4th Street Bar.</p>',
    created: '2026-08-17T22:00:00',
    positiveVotes: 7,
    negativeVotes: 1,
    replyCount: 1,
    payout: 1.25,
  };
}

function createFixture() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    SESSION_SECRET: 'm18-4-visual-fixture-session-secret-32-bytes',
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
      throw new Error(`M18.4 visual fixture forbids Hive RPC: ${api}.${method}`);
    },
  };
  const readCalls = [];
  const hiveReadService = {
    async getCommunity(name) {
      readCalls.push({ method: 'getCommunity', name });
      return {
        name,
        title: '4th Street Bar',
        aboutHtml: '<p>A place to keep the 4th Street Bar conversation going.</p>',
        subscriberCount: 42,
        pendingRewards: 1.25,
      };
    },
    async getCommunityPosts(options) {
      readCalls.push({ method: 'getCommunityPosts', options });
      const post = fixturePost();
      return {
        items: [post],
        profiles: { [ACCOUNT]: profile() },
        sort: options.sort || 'created',
        nextCursor: null,
      };
    },
    async isCommunityMember(account, community) {
      readCalls.push({ method: 'isCommunityMember', account, community });
      return false;
    },
    async getPostWithComments(author, permlink) {
      readCalls.push({ method: 'getPostWithComments', author, permlink });
      assert.equal(author, ACCOUNT);
      assert.equal(permlink, 'welcome-fourth-street-bar');
      const post = fixturePost();
      const comment = {
        author: 'barfriend',
        permlink: 're-welcome-fourth-street-bar',
        parentAuthor: ACCOUNT,
        parentPermlink: post.permlink,
        bodyHtml: '<p>Glad to be here. See you at the bar.</p>',
        created: '2026-08-17T22:30:00',
        depth: 1,
        positiveVotes: 2,
        negativeVotes: 0,
        payout: 0.1,
      };
      return {
        post,
        comments: [comment],
        profiles: {
          [ACCOUNT]: profile(),
          barfriend: barfriendProfile(),
        },
      };
    },
    async getProfile(account) {
      readCalls.push({ method: 'getProfile', account });
      assert.equal(account, ACCOUNT);
      return profile();
    },
    async getFollowers(account) {
      readCalls.push({ method: 'getFollowers', account });
      assert.equal(account, ACCOUNT);
      return { items: [], nextCursor: null };
    },
    async getFollowing(account) {
      readCalls.push({ method: 'getFollowing', account });
      assert.equal(account, ACCOUNT);
      return { items: [], nextCursor: null };
    },
    async getWallet(account) {
      readCalls.push({ method: 'getWallet', account });
      assert.equal(account, ACCOUNT);
      return {
        account,
        liquidHive: 12.345,
        liquidHbd: 6.789,
        hivePower: 550,
        votingPowerPercent: 70,
        beerSegmentsFilled: 7,
        resourceCreditsPercent: 60,
        milestone: {
          name: 'Regular Drinker',
          icon: '🍺',
          hasNextLevel: true,
          max: 1000,
          progressPercent: 55,
        },
        hasClaimableRewards: true,
        rewards: { hive: 1, hbd: 0.5, hivePower: 0.5 },
        displayedAt: '2026-08-18T08:55:00Z',
      };
    },
    async getProfileSettings(account) {
      readCalls.push({ method: 'getProfileSettings', account });
      assert.equal(account, ACCOUNT);
      return {
        account,
        metadataValid: true,
        revision: 'm18-4-fixture-revision',
        displayName: 'Evan',
        about: 'Building the 4th Street Bar community.',
        profileImage: 'https://images.hive.blog/u/etblink/avatar',
        wallFee: '1.000 HBD',
        blocklist: ['spammer'],
      };
    },
    async getMessageHistory(options) {
      readCalls.push({ method: 'getMessageHistory', options });
      assert.equal(options.account, ACCOUNT);
      assert.equal(options.kind, 'inbox');
      return {
        items: [
          {
            sender: 'barfriend',
            amount: '1.000 HBD',
            ciphertext: '#8m18fourfixtureciphertext',
            timestamp: '2026-08-17T23:10:00',
            blockNumber: 98765432,
            transactionId: 'a'.repeat(40),
          },
        ],
        nextCursor: null,
      };
    },
  };

  const application = createApp({
    config,
    logger,
    now: () => NOW,
    rpcPool,
    hiveReadService,
    sessionStore,
  });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  application.locals.currentYear = new Date(NOW).getUTCFullYear();

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

async function settle(page) {
  await page.addStyleTag({
    content: '*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}',
  });
  await page.evaluate(async (timeoutMs) => {
    await globalThis.document.fonts.ready;
    const images = Array.from(globalThis.document.images);
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(
          () => reject(new Error(`Image readiness timed out: ${image.currentSrc || image.src}`)),
          timeoutMs,
        );
        const finish = (callback) => {
          globalThis.clearTimeout(timer);
          callback();
        };
        image.addEventListener('load', () => finish(resolve), { once: true });
        image.addEventListener(
          'error',
          () => finish(() => reject(new Error(`Image failed to load: ${image.currentSrc || image.src}`))),
          { once: true },
        );
      });
    }));
    await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
  }, IMAGE_READY_TIMEOUT_MS);
}

async function prepare(page, scenario) {
  if (scenario.id === 'community-composer') {
    const details = page.locator('.social-composer').first();
    await details.locator('summary').click();
    assert.equal(await details.evaluate((node) => node.open), true);
  }
  await settle(page);
}

async function captureEvidence(page, scenario, width) {
  const result = await page.evaluate(({ scenarioId, widthValue }) => {
    const visible = (node) => {
      const style = globalThis.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const horizontalScrollAncestor = (node) => {
      let ancestor = node.parentElement;
      while (ancestor && ancestor !== globalThis.document.body) {
        const style = globalThis.getComputedStyle(ancestor);
        if (
          ['auto', 'scroll'].includes(style.overflowX) &&
          ancestor.scrollWidth > ancestor.clientWidth + 1
        ) return true;
        ancestor = ancestor.parentElement;
      }
      return false;
    };
    const root = globalThis.document.documentElement;
    const outsideFocusables = Array.from(
      globalThis.document.querySelectorAll('a[href],button,input,textarea,select,summary'),
    )
      .filter(visible)
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return (rect.left < -1 || rect.right > globalThis.innerWidth + 1) && !horizontalScrollAncestor(node);
      })
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        text: node.textContent.trim().slice(0, 100),
        rect: node.getBoundingClientRect().toJSON(),
      }));

    return {
      scenarioId,
      width: widthValue,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      outsideFocusables,
      keychainStub: globalThis.__M18_4_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      followersEmpty: globalThis.document.body.textContent.includes('This account has no followers yet.'),
      followingEmpty: globalThis.document.body.textContent.includes('This account is not following anyone yet.'),
      communityComposer: Boolean(globalThis.document.querySelector('form[data-social-action="post"]')),
      replyComposer: Boolean(globalThis.document.querySelector('form[data-social-action="comment"]')),
      wallet: Boolean(globalThis.document.querySelector('[data-m15-surface="wallet"]')),
      inbox: Boolean(globalThis.document.querySelector('[data-inbox-entry]')),
      settings: Boolean(globalThis.document.querySelector('form[data-m4-action="profile"]')),
    };
  }, { scenarioId: scenario.id, widthValue: width });

  assert.ok(result.horizontalOverflow <= 1, JSON.stringify(result));
  assert.deepEqual(result.outsideFocusables, [], JSON.stringify(result));
  assert.equal(result.keychainStub, true);
  assert.equal(result.nativeKeychain, false);

  if (scenario.id === 'followers-empty') assert.equal(result.followersEmpty, true);
  if (scenario.id === 'following-empty') assert.equal(result.followingEmpty, true);
  if (scenario.id === 'community-composer') assert.equal(result.communityComposer, true);
  if (scenario.id === 'post-reply-composer') assert.equal(result.replyComposer, true);
  if (scenario.id === 'wallet') assert.equal(result.wallet, true);
  if (scenario.id === 'inbox-settings-inbox') assert.equal(result.inbox, true);
  if (scenario.id === 'inbox-settings-settings') assert.equal(result.settings, true);

  if (width < 1200) {
    await page.evaluate(() => globalThis.scrollTo(0, globalThis.document.documentElement.scrollHeight));
    await page.waitForTimeout(20);
    const footer = await page.evaluate(() => {
      const line = globalThis.document.querySelector('.app-footer p:last-child')?.getBoundingClientRect();
      const nav = globalThis.document.querySelector('.app-primary-nav')?.getBoundingClientRect();
      return line && nav ? { footerLineBottom: line.bottom, navigationTop: nav.top } : null;
    });
    assert.ok(footer, 'Mobile footer/navigation geometry could not be measured');
    assert.ok(footer.footerLineBottom <= footer.navigationTop + 1, JSON.stringify(footer));
    await page.evaluate(() => globalThis.scrollTo(0, 0));
  }

  return result;
}

async function run() {
  assert.ok(OUTPUT.startsWith(ROOT), 'M18.4 visual output must remain inside the repository');
  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });

  const fixture = createFixture();
  const server = await listen(fixture.app);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  const screenshots = [];
  const unexpectedNetwork = [];
  const consoleErrors = [];
  const pageErrors = [];

  try {
    for (const scenario of SCENARIOS) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: HEIGHT } });
        await context.addInitScript({ content: KEYCHAIN_STUB });
        await context.route('**/*', async (route) => {
          const requestUrl = new URL(route.request().url());
          if (requestUrl.origin === baseUrl) {
            await route.continue();
            return;
          }
          unexpectedNetwork.push({ scenario: scenario.id, width, url: requestUrl.toString() });
          await route.abort();
        });
        if (scenario.authenticated) {
          await context.addCookies([{
            name: 'hive_bar_session',
            value: fixture.token,
            url: baseUrl,
            httpOnly: true,
            sameSite: 'Lax',
          }]);
        }
        const page = await context.newPage();
        page.on('console', (message) => {
          if (message.type() === 'error') {
            consoleErrors.push({ scenario: scenario.id, width, text: message.text() });
          }
        });
        page.on('pageerror', (error) => {
          pageErrors.push({ scenario: scenario.id, width, message: error.message });
        });

        const response = await page.goto(`${baseUrl}${scenario.path}`, { waitUntil: 'networkidle' });
        assert.equal(response?.status(), 200, `${scenario.id} ${width} did not render HTTP 200`);
        await prepare(page, scenario);
        const evidence = await captureEvidence(page, scenario, width);
        const filename = path.join(SHOTS, `${scenario.id}-${width}.png`);
        const image = await page.screenshot({ path: filename, fullPage: true });
        screenshots.push({
          scenario: scenario.id,
          width,
          path: path.relative(OUTPUT, filename).split(path.sep).join('/'),
          sha256: sha256(image),
          evidence,
        });
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  assert.deepEqual(fixture.mutationAttempts, [], 'Visual fixture observed a mutation attempt');
  assert.deepEqual(fixture.rpcPool.calls, [], 'Visual fixture observed a Hive RPC call');
  assert.deepEqual(unexpectedNetwork, [], 'Visual fixture observed unexpected external network');
  assert.deepEqual(consoleErrors, [], 'Visual fixture observed browser console errors');
  assert.deepEqual(pageErrors, [], 'Visual fixture observed browser page errors');
  assert.equal(screenshots.length, SCENARIOS.length * WIDTHS.length);

  const manifest = {
    milestone: 'M18.4',
    source: {
      commit: git('rev-parse', 'HEAD'),
      tree: git('rev-parse', 'HEAD^{tree}'),
      parent: git('rev-parse', 'HEAD^'),
    },
    runtime: {
      node: process.version,
      playwright: playwrightPackage.version,
      chromium: browser.version(),
    },
    viewport: { widths: WIDTHS, height: HEIGHT },
    scenarios: SCENARIOS,
    safety: {
      writeMode: fixture.config.hive.writeMode,
      signerMode: fixture.config.hive.signerMode,
      mutationAttempts: fixture.mutationAttempts,
      hiveRpcCalls: fixture.rpcPool.calls,
      deterministicReadCalls: fixture.readCalls,
      unexpectedNetwork,
      consoleErrors,
      pageErrors,
      keychain: 'incapable test stub; native Keychain forbidden',
    },
    screenshots,
  };
  await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`M18.4 visual acceptance passed: ${screenshots.length} captures.\n`);
}

run().catch((error) => {
  process.stderr.write(`M18.4 visual acceptance failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
