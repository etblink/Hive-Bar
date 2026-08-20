'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const axe = require('axe-core');
const { chromium } = require('playwright');
const playwrightPackage = require('playwright/package.json');
const { createUx1fVisualFixture } = require('../test/support/ux-1f-fixture');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.UX_1F_VISUAL_OUTPUT || 'artifacts/ux-1f-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const READY_WIDTHS = Object.freeze([360, 390, 768, 1024, 1440, 1600]);
const COMPACT_WIDTHS = Object.freeze([390, 1440]);
const IMAGE_READY_TIMEOUT_MS = 5000;
const SCENARIOS = Object.freeze([
  { id: 'home-ready', status: 'ready', widths: READY_WIDTHS },
  { id: 'home-empty', status: 'empty', widths: COMPACT_WIDTHS },
  { id: 'home-unavailable', status: 'unavailable', widths: COMPACT_WIDTHS },
]);

const KEYCHAIN_STUB = `'use strict';
Object.defineProperty(window, '__UX_1F_KEYCHAIN_DISABLED__', { value: true });
window.HiveBarKeychain = Object.freeze({
  KeychainAdapter: class {
    async broadcast() { throw new Error('UX-1F visual qualification forbids Keychain signing'); }
    async signBuffer() { throw new Error('UX-1F visual qualification forbids Keychain signing'); }
  }
});`;

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function heightFor(width) {
  if (width === 360) return 800;
  if (width === 390) return 844;
  if (width < 1200) return 900;
  return 1000;
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
    await Promise.all(images.map((image) => {
      const authoredLoading = image.getAttribute('loading');
      if (authoredLoading) image.dataset.ux1fAuthoredLoading = authoredLoading;
      image.loading = 'eager';
      if (image.complete) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(
          () => reject(new Error(`Image readiness timed out: ${image.currentSrc || image.src}`)),
          timeoutMs,
        );
        const finish = (handler) => {
          globalThis.clearTimeout(timer);
          handler();
        };
        image.addEventListener('load', () => finish(resolve), { once: true });
        image.addEventListener(
          'error',
          () => finish(() => reject(new Error(`Image failed to load: ${image.currentSrc || image.src}`))),
          { once: true },
        );
      });
    }));
    const failed = images
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);
    if (failed.length > 0) throw new Error(`Image readiness failed: ${failed.join(', ')}`);
    await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
  }, IMAGE_READY_TIMEOUT_MS);
}

async function paintFullDocument(page) {
  const offsets = await page.evaluate(() => {
    const root = globalThis.document.documentElement;
    const maxScrollY = Math.max(0, root.scrollHeight - globalThis.innerHeight);
    const step = Math.max(1, Math.floor(globalThis.innerHeight * 0.75));
    const values = [0];
    for (let y = step; y < maxScrollY; y += step) values.push(y);
    if (values.at(-1) !== maxScrollY) values.push(maxScrollY);
    return values;
  });

  for (const offset of offsets) {
    await page.evaluate((next) => globalThis.scrollTo(0, next), offset);
    await page.waitForTimeout(20);
    await page.evaluate(() => new Promise((resolve) => {
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve));
    }));
  }
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.waitForTimeout(20);
  return {
    steps: offsets.length,
    maxScrollY: offsets.at(-1),
    finalScrollY: await page.evaluate(() => globalThis.scrollY),
  };
}

async function initialEvidence(page, scenario, width) {
  return page.evaluate(({ scenarioId, status, widthValue }) => {
    const document = globalThis.document;
    const root = document.documentElement;
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };
    const visible = (node) => {
      const style = globalThis.getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const hero = document.querySelector('[data-home-hero]');
    const heading = hero.querySelector('h1');
    const primary = hero.querySelector('.home-hero__primary');
    const secondary = hero.querySelector('.home-hero__secondary');
    const heroImage = hero.querySelector('.home-hero__image');
    const navigation = document.querySelector('.app-primary-nav');
    const navigationStyle = globalThis.getComputedStyle(navigation);
    const navigationRect = rect(navigation);
    const ctaLimit = navigationStyle.position === 'fixed'
      ? navigationRect.top
      : globalThis.innerHeight;
    const updates = document.querySelector('[data-home-updates-state]');
    const note = updates.querySelector('.home-updates-note');
    const galleryImages = Array.from(document.querySelectorAll('.home-gallery__image'));
    const allImages = Array.from(document.querySelectorAll('main img'));
    const interactive = Array.from(document.querySelectorAll('main a[href],main button,main summary'))
      .filter(visible)
      .map((node) => ({ text: node.textContent.trim(), box: rect(node) }));
    const undersizedTargets = interactive.filter(({ box }) => box.width < 44 || box.height < 44);
    const imageFailures = allImages
      .filter((image) => !image.complete || image.naturalWidth === 0)
      .map((image) => image.getAttribute('src'));
    const documentaryImages = allImages.map((image) => ({
      src: image.getAttribute('src'),
      alt: image.getAttribute('alt'),
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
      loading: image.dataset.ux1fAuthoredLoading || image.getAttribute('loading'),
    }));
    const headings = Array.from(document.querySelectorAll('main h1,main h2,main h3'), (node) => ({
      level: Number(node.tagName.slice(1)),
      text: node.textContent.trim(),
    }));

    return {
      scenarioId,
      expectedStatus: status,
      width: widthValue,
      viewportHeight: globalThis.innerHeight,
      scrollY: globalThis.scrollY,
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      h1Count: document.querySelectorAll('main h1').length,
      h1Text: heading.textContent.trim(),
      hero: rect(hero),
      heading: rect(heading),
      primary: rect(primary),
      secondary: rect(secondary),
      ctaLimit,
      heroLogoCount: hero.querySelectorAll('img[src="/images/fourth-street-bar-logo.jpg"]').length,
      mainLogoCount: document.querySelectorAll('main img[src="/images/fourth-street-bar-logo.jpg"]').length,
      shellLogoCount: document.querySelectorAll('.app-shell-header img[data-bar-logo]').length,
      heroImage: {
        complete: heroImage.complete,
        naturalWidth: heroImage.naturalWidth,
        objectFit: globalThis.getComputedStyle(heroImage).objectFit,
        objectPosition: globalThis.getComputedStyle(heroImage).objectPosition,
      },
      documentaryImages,
      galleryCrops: galleryImages.map((image) => ({
        src: image.getAttribute('src'),
        objectFit: globalThis.getComputedStyle(image).objectFit,
        objectPosition: globalThis.getComputedStyle(image).objectPosition,
      })),
      imageFailures,
      updateStatus: updates.dataset.homeUpdatesState,
      updateCount: updates.querySelectorAll('.home-update').length,
      updateLinks: Array.from(updates.querySelectorAll('.home-update h3 a'), (link) => link.getAttribute('href')),
      noteHeight: note ? rect(note).height : null,
      stateCardCount: updates.querySelectorAll('.state-card').length,
      headings,
      undersizedTargets,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      keychainStub: globalThis.__UX_1F_KEYCHAIN_DISABLED__ === true,
    };
  }, { scenarioId: scenario.id, status: scenario.status, widthValue: width });
}

function assertInitialEvidence(evidence) {
  assert.ok(evidence.horizontalOverflow <= 1, JSON.stringify(evidence));
  assert.equal(evidence.scrollY, 0, JSON.stringify(evidence));
  assert.equal(evidence.h1Count, 1);
  assert.equal(evidence.h1Text, '4th Street Bar');
  assert.equal(evidence.heroLogoCount, 0);
  assert.equal(evidence.mainLogoCount, 0);
  assert.equal(evidence.shellLogoCount, 1);
  assert.ok(evidence.hero.height >= evidence.viewportHeight * 0.72, JSON.stringify(evidence.hero));
  assert.ok(evidence.hero.bottom >= evidence.viewportHeight * 0.86, JSON.stringify(evidence.hero));
  assert.ok(evidence.heading.top >= 0 && evidence.heading.bottom <= evidence.ctaLimit, JSON.stringify(evidence));
  assert.ok(evidence.primary.bottom <= evidence.ctaLimit - 6, JSON.stringify(evidence));
  assert.ok(evidence.secondary.bottom <= evidence.ctaLimit - 6, JSON.stringify(evidence));
  assert.ok(evidence.primary.width >= 44 && evidence.primary.height >= 44, JSON.stringify(evidence.primary));
  assert.ok(evidence.secondary.width >= 44 && evidence.secondary.height >= 44, JSON.stringify(evidence.secondary));
  assert.equal(evidence.heroImage.complete, true);
  assert.ok(evidence.heroImage.naturalWidth > 0);
  assert.equal(evidence.heroImage.objectFit, 'cover');
  assert.equal(evidence.documentaryImages.length, 4);
  assert.deepEqual(evidence.imageFailures, []);
  assert.ok(evidence.documentaryImages.every((image) => image.alt && image.width && image.height));
  assert.equal(evidence.documentaryImages.filter((image) => image.loading === 'lazy').length, 3);
  assert.ok(evidence.galleryCrops.every((image) => image.objectFit === 'cover'));
  assert.equal(evidence.updateStatus, evidence.expectedStatus);
  assert.equal(evidence.stateCardCount, 0);
  assert.deepEqual(evidence.undersizedTargets, []);
  assert.equal(evidence.nativeKeychain, false);
  assert.equal(evidence.keychainStub, true);
  assert.equal(evidence.headings[0].level, 1);
  assert.ok(evidence.headings.slice(1).every(({ level }) => level === 2 || level === 3));

  if (evidence.expectedStatus === 'ready') {
    assert.equal(evidence.updateCount, 3);
    assert.deepEqual(evidence.updateLinks, [
      '/post/fourthstreetbar/patio-lights-at-sunset',
      '/post/fourthstreetbar/from-behind-the-bar',
      '/post/fourthstreetbar/join-the-community-conversation',
    ]);
    assert.equal(evidence.noteHeight, null);
  } else {
    assert.equal(evidence.updateCount, 0);
    assert.ok(evidence.noteHeight > 0 && evidence.noteHeight <= 150, JSON.stringify(evidence));
  }
}

async function focusEvidence(page) {
  await page.evaluate(() => {
    globalThis.scrollTo(0, 0);
    if (globalThis.document.activeElement instanceof globalThis.HTMLElement) {
      globalThis.document.activeElement.blur();
    }
  });
  let focused = false;
  for (let index = 0; index < 16; index += 1) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => globalThis.document.activeElement?.matches('.home-hero__primary') === true);
    if (focused) break;
  }
  assert.equal(focused, true, 'Keyboard traversal did not reach the primary homepage action');
  const result = await page.locator('.home-hero__primary').evaluate((node) => {
    const style = globalThis.getComputedStyle(node);
    return {
      focusVisible: node.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      scrollY: globalThis.scrollY,
    };
  });
  assert.equal(result.focusVisible, true, JSON.stringify(result));
  assert.notEqual(result.outlineStyle, 'none', JSON.stringify(result));
  assert.notEqual(result.outlineWidth, '0px', JSON.stringify(result));
  assert.equal(result.scrollY, 0, JSON.stringify(result));
  return result;
}

async function accessibilityEvidence(page, label) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(globalThis.document, { resultTypes: ['violations'] });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    }));
  });
  const blocking = violations.filter(({ impact }) => ['serious', 'critical'].includes(impact));
  assert.deepEqual(blocking, [], `${label}: serious/critical accessibility violations`);
  return violations;
}

async function footerNavigationEvidence(page, width) {
  if (width >= 1200) return null;
  await page.evaluate(() => globalThis.scrollTo(0, globalThis.document.documentElement.scrollHeight));
  await page.waitForTimeout(20);
  const result = await page.evaluate(() => {
    const footer = globalThis.document.querySelector('.app-footer p:last-child').getBoundingClientRect();
    const navigation = globalThis.document.querySelector('.app-primary-nav').getBoundingClientRect();
    return { footerBottom: footer.bottom, navigationTop: navigation.top };
  });
  assert.ok(result.footerBottom <= result.navigationTop + 1, JSON.stringify(result));
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.waitForTimeout(20);
  return result;
}

async function capture({ browser, baseUrl, scenario, width }) {
  const height = heightFor(width);
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
  });
  const violations = [];
  const consoleErrors = [];
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
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: KEYCHAIN_STUB,
      });
    }
    return route.continue();
  });

  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await settle(page);
  const evidence = await initialEvidence(page, scenario, width);
  assertInitialEvidence(evidence);
  evidence.axe = await accessibilityEvidence(page, `${scenario.id}-${width}`);
  evidence.paintWalk = await paintFullDocument(page);
  assert.equal(evidence.paintWalk.finalScrollY, 0);
  evidence.footerNavigation = await footerNavigationEvidence(page, width);
  evidence.focus = await focusEvidence(page);
  assert.deepEqual(violations, []);
  assert.deepEqual(consoleErrors, []);

  const filename = path.join(SHOTS, `${String(width).padStart(4, '0')}-${scenario.id}.png`);
  const bytes = await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
  await context.close();
  return {
    scenario: scenario.id,
    status: scenario.status,
    viewport: { width, height },
    path: path.relative(OUTPUT, filename).split(path.sep).join('/'),
    sha256: sha256(bytes),
    evidence,
  };
}

async function main() {
  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const manifest = {
    schemaVersion: 1,
    milestone: 'UX-1F',
    result: 'running',
    git: { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') },
    runtime: {
      node: process.version,
      npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
      playwright: playwrightPackage.version,
      chromium: browser.version(),
    },
    scenarios: SCENARIOS.map(({ id, status, widths }) => ({ id, status, widths })),
    captures: [],
    fixtures: {},
  };

  try {
    for (const scenario of SCENARIOS) {
      const fixture = createUx1fVisualFixture(scenario.status);
      const server = await listen(fixture.app);
      const baseUrl = `http://127.0.0.1:${server.address().port}/`;
      try {
        for (const width of scenario.widths) {
          manifest.captures.push(await capture({ browser, baseUrl, scenario, width }));
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
      const expectedOptions = {
        account: fixture.config.hive.officialBarAccount,
        community: fixture.config.hive.communityId,
        limit: 3,
      };
      assert.equal(fixture.readCalls.length, scenario.widths.length);
      assert.ok(fixture.readCalls.every((call) =>
        call.method === 'getOfficialCommunityPosts' &&
        JSON.stringify(call.options) === JSON.stringify(expectedOptions)));
      assert.deepEqual(fixture.unexpectedReadCalls, []);
      assert.deepEqual(fixture.mutationAttempts, []);
      assert.deepEqual(fixture.rpcPool.calls, []);
      manifest.fixtures[scenario.status] = {
        readCalls: fixture.readCalls,
        unexpectedReadCalls: fixture.unexpectedReadCalls,
        mutationAttempts: fixture.mutationAttempts,
        rpcCalls: fixture.rpcPool.calls,
      };
    }
    assert.equal(manifest.captures.length, 10);
    manifest.result = 'passed';
  } catch (error) {
    manifest.result = 'failed';
    manifest.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await browser.close().catch(() => {});
  }

  process.stdout.write(JSON.stringify({
    result: manifest.result,
    captures: manifest.captures.length,
    commit: manifest.git.commit,
    tree: manifest.git.tree,
    output: path.relative(ROOT, OUTPUT),
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
