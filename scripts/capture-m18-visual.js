'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const playwrightPackage = require('playwright/package.json');
const {
  FIXTURE_ACCOUNT,
  FIXTURE_NOW_MS,
  VISUAL_HEIGHT,
  VISUAL_WIDTHS,
  createM18VisualFixture,
} = require('../test/support/m18-visual-fixture');

const ROOT = path.join(__dirname, '..');
const OUTPUT_ROOT = path.resolve(ROOT, process.env.M18_VISUAL_OUTPUT || 'artifacts/m18-visual');
const SCREENSHOT_ROOT = path.join(OUTPUT_ROOT, 'screenshots');
const EXPECTED_SIGNED_OUT_NAV = ['Home', 'Community', 'Threads', 'Sign in'];
const EXPECTED_SIGNED_IN_NAV = ['Home', 'Community', 'Threads', 'You'];
const EXPECTED_INTENTIONAL_401_CONSOLE_ERROR =
  'Failed to load resource: the server responded with a status of 401 (Unauthorized)';
const KEYCHAIN_STUB = `'use strict';
Object.defineProperty(window, '__M18_VISUAL_KEYCHAIN_DISABLED__', { value: true });
window.HiveBarKeychain = Object.freeze({
  KeychainAdapter: class M18VisualDisabledKeychainAdapter {
    constructor() {
      throw new Error('M18 visual qualification forbids Keychain access');
    }
  }
});`;

const SCENARIOS = Object.freeze([
  {
    id: 'signed-out-auth-required',
    authenticated: false,
    path: `/profile/${FIXTURE_ACCOUNT}/inbox`,
    statusCode: 401,
  },
  {
    id: 'signed-out-sign-in-form',
    authenticated: false,
    path: `/profile/${FIXTURE_ACCOUNT}/inbox`,
    statusCode: 401,
  },
  {
    id: 'fixture-authenticated-profile',
    authenticated: true,
    path: `/profile/${FIXTURE_ACCOUNT}`,
    statusCode: 200,
  },
  {
    id: 'fixture-authenticated-dialog',
    authenticated: true,
    path: `/profile/${FIXTURE_ACCOUNT}`,
    statusCode: 200,
  },
  {
    id: 'fixture-authenticated-busy',
    authenticated: true,
    path: `/profile/${FIXTURE_ACCOUNT}`,
    statusCode: 200,
  },
]);

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function relativeArtifactPath(filename) {
  return path.relative(OUTPUT_ROOT, filename).split(path.sep).join('/');
}

function assertSafeOutputRoot() {
  const relative = path.relative(ROOT, OUTPUT_ROOT);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertExpectedConsoleErrors({ consoleErrors, documentUrl, statusCode }) {
  if (statusCode !== 401) {
    assert.deepEqual(consoleErrors, []);
    return;
  }

  assert.equal(consoleErrors.length, 1);
  assert.equal(consoleErrors[0].text, EXPECTED_INTENTIONAL_401_CONSOLE_ERROR);
  if (consoleErrors[0].locationUrl) {
    assert.equal(consoleErrors[0].locationUrl, documentUrl);
  }
}

async function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function allowedLocalRequest(pathname, documentPath) {
  return (
    pathname === documentPath ||
    pathname.startsWith('/css/') ||
    pathname.startsWith('/htmx/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/js/')
  );
}

async function installNetworkGuard(context, { baseUrl, documentPath }) {
  const expectedOrigin = new URL(baseUrl).origin;
  const violations = [];
  let keychainStubCount = 0;

  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const method = request.method();
    const record = { method, url: request.url(), resourceType: request.resourceType() };

    if (requestUrl.origin !== expectedOrigin) {
      violations.push({ ...record, reason: 'outbound-origin' });
      await route.abort('blockedbyclient');
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      violations.push({ ...record, reason: 'mutation-method' });
      await route.abort('blockedbyclient');
      return;
    }
    if (!allowedLocalRequest(requestUrl.pathname, documentPath)) {
      violations.push({ ...record, reason: 'unexpected-local-path' });
      await route.abort('blockedbyclient');
      return;
    }
    if (requestUrl.pathname === '/js/keychain-adapter.js') {
      keychainStubCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: KEYCHAIN_STUB,
      });
      return;
    }
    await route.continue();
  });

  return {
    violations,
    keychainStubCount: () => keychainStubCount,
  };
}

async function settlePresentation(page) {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.evaluate(async () => {
    await globalThis.document.fonts.ready;
    await Promise.all(
      Array.from(globalThis.document.images, (image) =>
        image.complete ? Promise.resolve() : image.decode(),
      ),
    );
    const reference = globalThis.document.querySelector('.app-state__reference');
    if (reference) reference.textContent = 'Reference: m18-visual-fixture';
    await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
    await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
  });
}

async function shellEvidence(page, { authenticated, width }) {
  const evidence = await page.evaluate(() => {
    const navigation = globalThis.document.querySelector('.app-primary-nav');
    const header = globalThis.document.querySelector('.app-shell-header');
    const root = globalThis.document.documentElement;
    const body = globalThis.document.body;
    const navRect = navigation.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const wordmark = globalThis.document.querySelector('.app-brand__wordmark strong');
    const wordmarkStyle = globalThis.getComputedStyle(wordmark);
    const footerLine = globalThis.document.querySelector('.app-footer p:last-child');
    const footerLineRect = footerLine.getBoundingClientRect();
    const navItems = Array.from(navigation.querySelectorAll('.app-nav-item'));
    const footerNavigationOverlap = Math.max(
      0,
      Math.min(footerLineRect.bottom, navRect.bottom) - Math.max(footerLineRect.top, navRect.top),
    );
    return {
      labels: Array.from(navigation.querySelectorAll('.app-nav-label'), (item) =>
        item.textContent.trim(),
      ),
      itemCount: navItems.length,
      disabledCount: navigation.querySelectorAll('[aria-disabled="true"]').length,
      payLinkCount: navigation.querySelectorAll('a[href="/pay"]').length,
      currentLinks: Array.from(navigation.querySelectorAll('[aria-current="page"]'), (item) =>
        item.getAttribute('href'),
      ),
      navigationPosition: globalThis.getComputedStyle(navigation).position,
      headerPosition: globalThis.getComputedStyle(header).position,
      bodyPaddingBottom: Number.parseFloat(globalThis.getComputedStyle(body).paddingBottom),
      bodyPaddingLeft: Number.parseFloat(globalThis.getComputedStyle(body).paddingLeft),
      navigationRect: {
        left: navRect.left,
        right: navRect.right,
        top: navRect.top,
        bottom: navRect.bottom,
      },
      headerRect: {
        left: headerRect.left,
        right: headerRect.right,
        top: headerRect.top,
        bottom: headerRect.bottom,
        width: headerRect.width,
      },
      navItemsWithinViewport: navItems.every((item) => {
        const rect = item.getBoundingClientRect();
        return rect.left >= -1 && rect.right <= globalThis.innerWidth + 1;
      }),
      horizontalOverflow: Math.max(0, root.scrollWidth - globalThis.innerWidth),
      keychainDisabled: globalThis.__M18_VISUAL_KEYCHAIN_DISABLED__ === true,
      nativeKeychainPresent: typeof globalThis.hive_keychain !== 'undefined',
      footerNavigationOverlap,
      wordmark: {
        text: wordmark.textContent.trim(),
        clipped:
          wordmark.scrollWidth > wordmark.clientWidth + 1 &&
          ['hidden', 'clip'].includes(wordmarkStyle.overflowX),
        overflowX: wordmarkStyle.overflowX,
        textOverflow: wordmarkStyle.textOverflow,
        whiteSpace: wordmarkStyle.whiteSpace,
      },
    };
  });

  assert.deepEqual(
    evidence.labels,
    authenticated ? EXPECTED_SIGNED_IN_NAV : EXPECTED_SIGNED_OUT_NAV,
  );
  assert.equal(evidence.itemCount, 4);
  assert.equal(evidence.disabledCount, 0);
  assert.equal(evidence.payLinkCount, 0);
  assert.ok(evidence.horizontalOverflow <= 1);
  assert.equal(evidence.navItemsWithinViewport, true);
  assert.equal(evidence.keychainDisabled, true);
  assert.equal(evidence.nativeKeychainPresent, false);

  if (authenticated) {
    assert.deepEqual(evidence.currentLinks, [`/profile/${FIXTURE_ACCOUNT}`]);
  }
  if (width < 1200) {
    assert.equal(evidence.navigationPosition, 'fixed');
    assert.ok(Math.abs(evidence.navigationRect.bottom - VISUAL_HEIGHT) <= 1);
    assert.ok(evidence.bodyPaddingBottom >= 75);
    assert.ok(evidence.bodyPaddingLeft <= 1);
    assert.ok(evidence.footerNavigationOverlap <= 1);
  } else {
    assert.equal(evidence.navigationPosition, 'static');
    assert.equal(evidence.headerPosition, 'fixed');
    assert.ok(Math.abs(evidence.headerRect.width - 240) <= 1);
    assert.ok(Math.abs(evidence.bodyPaddingLeft - 240) <= 1);
    assert.equal(evidence.wordmark.text, '4th Street Bar');
    assert.equal(evidence.wordmark.clipped, false);
    assert.notEqual(evidence.wordmark.textOverflow, 'ellipsis');
    assert.equal(evidence.wordmark.whiteSpace, 'normal');
  }

  return evidence;
}

async function prepareScenario(page, scenario) {
  if (scenario.id === 'signed-out-auth-required') {
    const access = await page.evaluate(() => {
      const state = globalThis.document.querySelector('main .app-state--access');
      const primary = state?.querySelector('.button-primary');
      return {
        heading: state?.querySelector('h1')?.textContent.trim(),
        role: state?.getAttribute('role'),
        primaryHeight: primary?.getBoundingClientRect().height || 0,
      };
    });
    assert.equal(access.heading, 'Sign in required');
    assert.equal(access.role, 'status');
    assert.ok(access.primaryHeight >= 44);
    return { access };
  }

  if (scenario.id === 'signed-out-sign-in-form') {
    await page.locator('#hive-sign-in > summary').click();
    const signIn = await page.evaluate(() => {
      const details = globalThis.document.querySelector('#hive-sign-in');
      const panel = details.querySelector('.app-signin__panel');
      const input = panel.querySelector('.app-field-control');
      const navigation = globalThis.document.querySelector('.app-primary-nav');
      const panelRect = panel.getBoundingClientRect();
      const navigationRect = navigation.getBoundingClientRect();
      return {
        open: details.open,
        panelRect: {
          left: panelRect.left,
          right: panelRect.right,
          top: panelRect.top,
          bottom: panelRect.bottom,
        },
        navigationTop: navigationRect.top,
        inputHeight: input.getBoundingClientRect().height,
        describedBy: input.getAttribute('aria-describedby'),
      };
    });
    assert.equal(signIn.open, true);
    assert.ok(signIn.panelRect.left >= -1);
    assert.ok(signIn.panelRect.right <= globalThis.Number(page.viewportSize().width) + 1);
    assert.ok(signIn.panelRect.top >= -1);
    assert.ok(signIn.inputHeight >= 48);
    assert.equal(signIn.describedBy, 'hive-login-help hive-login-status');
    if (page.viewportSize().width < 1200) {
      assert.ok(signIn.panelRect.bottom <= signIn.navigationTop + 1);
    } else {
      assert.ok(signIn.panelRect.bottom <= VISUAL_HEIGHT + 1);
    }
    return { signIn };
  }

  if (scenario.id === 'fixture-authenticated-profile') {
    const profile = await page.evaluate(() => ({
      heading: globalThis.document.querySelector('#profile-heading')?.textContent.trim(),
      ownerTabs: Array.from(
        globalThis.document.querySelectorAll('.profile-tabs .content-tab'),
        (item) => item.textContent.trim(),
      ),
      signInFormPresent: Boolean(globalThis.document.querySelector('[data-keychain-login]')),
      signOutPresent: Boolean(globalThis.document.querySelector('[data-keychain-logout]')),
    }));
    assert.equal(profile.heading, 'Evan');
    assert.deepEqual(profile.ownerTabs, [
      'Posts',
      'Wallet',
      'Wall',
      'Followers',
      'Following',
      'Inbox',
      'Settings',
    ]);
    assert.equal(profile.signInFormPresent, false);
    assert.equal(profile.signOutPresent, true);
    return { profile };
  }

  if (scenario.id === 'fixture-authenticated-dialog') {
    const dialog = await page.evaluate(() => {
      const element = globalThis.document.querySelector('[data-social-confirm]');
      element.querySelector('[data-social-account]').textContent = '@etblink';
      element.querySelector('[data-social-signer]').textContent = '@etblink';
      element.querySelector('[data-social-authority]').textContent = 'Posting';
      element.querySelector('[data-social-summary]').textContent = [
        'Action: comment',
        'Destination: 4th Street Bar community',
        'Result: presentation-only fixture; nothing can be sent',
      ].join('\n');
      element.querySelector('[data-social-fingerprint]').textContent =
        'm18-visual-fixture-no-operation';
      element.querySelector('[data-social-operations]').textContent =
        'No operation exists in this presentation-only fixture.';
      element.showModal();
      const rect = element.getBoundingClientRect();
      const summary = element.querySelector('[data-social-summary]');
      const summaryStyle = globalThis.getComputedStyle(summary);
      const confirm = element.querySelector('[data-social-confirm-button]').getBoundingClientRect();
      const cancel = element.querySelector('[data-social-cancel-button]').getBoundingClientRect();
      const style = globalThis.getComputedStyle(element);
      return {
        open: element.open,
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        overflowY: style.overflowY,
        horizontalCenterDelta: Math.abs((rect.left + rect.right) / 2 - globalThis.innerWidth / 2),
        verticalCenterDelta: Math.abs((rect.top + rect.bottom) / 2 - globalThis.innerHeight / 2),
        summaryHorizontalOverflow: Math.max(0, summary.scrollWidth - summary.clientWidth),
        summaryWhiteSpace: summaryStyle.whiteSpace,
        confirmVisible: confirm.top >= rect.top && confirm.bottom <= rect.bottom,
        cancelVisible: cancel.top >= rect.top && cancel.bottom <= rect.bottom,
      };
    });
    assert.equal(dialog.open, true);
    assert.ok(dialog.rect.left >= -1);
    assert.ok(dialog.rect.right <= page.viewportSize().width + 1);
    assert.ok(dialog.rect.top >= -1);
    assert.ok(dialog.rect.bottom <= VISUAL_HEIGHT + 1);
    assert.ok(['auto', 'scroll'].includes(dialog.overflowY));
    assert.ok(dialog.horizontalCenterDelta <= 2);
    assert.ok(dialog.verticalCenterDelta <= 2);
    if (page.viewportSize().width <= 390) {
      assert.ok(dialog.summaryHorizontalOverflow <= 1);
      assert.equal(dialog.summaryWhiteSpace, 'pre-wrap');
    }
    assert.equal(dialog.confirmVisible, true);
    assert.equal(dialog.cancelVisible, true);
    return { dialog };
  }

  if (scenario.id === 'fixture-authenticated-busy') {
    const busy = await page.evaluate(() => {
      const target = globalThis.document.querySelector('#profile-content');
      globalThis.document.dispatchEvent(
        new globalThis.CustomEvent('htmx:beforeRequest', { detail: { target } }),
      );
      const busyCue = globalThis.getComputedStyle(target, '::before');
      return {
        value: target.getAttribute('aria-busy'),
        cursor: globalThis.getComputedStyle(target).cursor,
        busyCueContent: busyCue.content,
        busyCueDisplay: busyCue.display,
      };
    });
    assert.equal(busy.value, 'true');
    assert.equal(busy.cursor, 'progress');
    assert.match(busy.busyCueContent, /Loading/);
    assert.notEqual(busy.busyCueDisplay, 'none');
    return { busy };
  }

  throw new Error(`Unknown M18 visual scenario: ${scenario.id}`);
}

async function completeScenario(page, scenario, details) {
  if (scenario.id === 'fixture-authenticated-busy') {
    const cleared = await page.evaluate(() => {
      const target = globalThis.document.querySelector('#profile-content');
      globalThis.document.dispatchEvent(
        new globalThis.CustomEvent('htmx:afterRequest', { detail: { target } }),
      );
      return {
        value: target.getAttribute('aria-busy'),
        busyCueContent: globalThis.getComputedStyle(target, '::before').content,
      };
    });
    assert.equal(cleared.value, 'false');
    assert.doesNotMatch(cleared.busyCueContent, /Loading/);
    details.busy.clearedValue = cleared.value;
    details.busy.clearedCueContent = cleared.busyCueContent;
  }
}

async function captureScenario({ browser, baseUrl, scenario, token, width }) {
  const context = await browser.newContext({
    viewport: { width, height: VISUAL_HEIGHT },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    reducedMotion: 'reduce',
  });
  const network = await installNetworkGuard(context, {
    baseUrl,
    documentPath: scenario.path,
  });
  if (scenario.authenticated) {
    await context.addCookies([
      {
        name: 'hive_bar_session',
        value: token,
        url: baseUrl,
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
  }

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const locationUrl = message.location().url;
    consoleErrors.push({
      locationUrl: locationUrl || null,
      text: message.text(),
    });
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    const documentUrl = `${baseUrl}${scenario.path}`;
    const response = await page.goto(documentUrl, {
      waitUntil: 'load',
      timeout: 15_000,
    });
    assert.ok(response);
    assert.equal(response.status(), scenario.statusCode);
    await settlePresentation(page);
    const shell = await shellEvidence(page, { authenticated: scenario.authenticated, width });
    const details = await prepareScenario(page, scenario);

    const filename = path.join(SCREENSHOT_ROOT, `${width}-${scenario.id}.png`);
    const screenshot = await page.screenshot({
      path: filename,
      fullPage: false,
      animations: 'disabled',
    });
    await completeScenario(page, scenario, details);

    assert.deepEqual(network.violations, []);
    assert.equal(network.keychainStubCount(), 1);
    assertExpectedConsoleErrors({
      consoleErrors,
      documentUrl,
      statusCode: scenario.statusCode,
    });
    assert.deepEqual(pageErrors, []);

    return {
      authenticated: scenario.authenticated,
      details,
      height: VISUAL_HEIGHT,
      id: scenario.id,
      keychainStubCount: network.keychainStubCount(),
      networkViolations: network.violations,
      path: scenario.path,
      screenshot: relativeArtifactPath(filename),
      screenshotSha256: sha256(screenshot),
      shell,
      statusCode: scenario.statusCode,
      width,
    };
  } finally {
    await page.close();
    await context.close();
  }
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function writeIndex(manifest) {
  const groups = VISUAL_WIDTHS.map((width) => {
    const cards = manifest.captures
      .filter((capture) => capture.width === width)
      .map(
        (capture) => `
          <figure>
            <img src="${htmlEscape(capture.screenshot)}" alt="${htmlEscape(capture.id)} at ${width} CSS pixels">
            <figcaption>${htmlEscape(capture.id)} · ${width} × ${capture.height} · <code>${capture.screenshotSha256}</code></figcaption>
          </figure>`,
      )
      .join('');
    return `<section><h2>${width} CSS pixels</h2><div class="grid">${cards}</div></section>`;
  }).join('');
  const html = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>M18.2 visual acceptance evidence</title>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 2rem; background: #080706; color: #f7f1e8; }
  h1, h2 { color: #f4a460; }
  section { margin-top: 3rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 1.5rem; }
  figure { margin: 0; border: 1px solid #3c342e; padding: 0.75rem; background: #11100f; }
  img { display: block; width: 100%; height: auto; border: 1px solid #3c342e; }
  figcaption { margin-top: 0.75rem; overflow-wrap: anywhere; color: #c8bfb4; font-size: 0.8rem; }
  code { color: #f7bd82; }
</style>
<body>
  <h1>M18.2 visual acceptance evidence</h1>
  <p>Commit <code>${htmlEscape(manifest.git.commit)}</code>; tree <code>${htmlEscape(manifest.git.tree)}</code>.</p>
  <p>${manifest.captures.length} deterministic Chromium viewport captures. Keychain, mutation requests, outbound origins, and Hive RPC were fail-closed.</p>
  ${groups}
</body>
</html>`;
  await fs.writeFile(path.join(OUTPUT_ROOT, 'index.html'), html, 'utf8');
}

async function main() {
  assertSafeOutputRoot();
  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await fs.mkdir(SCREENSHOT_ROOT, { recursive: true });

  const fixture = createM18VisualFixture();
  assert.equal(fixture.config.hive.writeMode, 'disabled');
  assert.equal(fixture.config.hive.signerMode, 'disabled');
  assert.equal(fixture.config.hive.writesEnabled, false);
  assert.equal(fixture.config.payments.enabled, false);

  const manifest = {
    schemaVersion: 1,
    result: 'running',
    fixture: {
      account: FIXTURE_ACCOUNT,
      clock: new Date(FIXTURE_NOW_MS).toISOString(),
      authentication: 'deterministic in-memory session; no real user session',
    },
    git: {
      branch: git('branch', '--show-current'),
      commit: git('rev-parse', 'HEAD'),
      parent: git('rev-parse', 'HEAD^'),
      tree: git('rev-parse', 'HEAD^{tree}'),
      workingTreeStatus: git('status', '--porcelain'),
    },
    runtime: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      playwright: playwrightPackage.version,
      browser: null,
    },
    viewport: {
      widths: VISUAL_WIDTHS,
      height: VISUAL_HEIGHT,
      deviceScaleFactor: 1,
    },
    safety: {
      hiveWriteMode: fixture.config.hive.writeMode,
      signerMode: fixture.config.hive.signerMode,
      paymentsEnabled: fixture.config.payments.enabled,
      mutationAttempts: fixture.mutationAttempts,
      hiveRpcCalls: fixture.rpcPool.calls,
      unexpectedFixtureReadCalls: fixture.hiveReadService.unexpectedCalls,
      keychain: 'network-replaced with an incapable throwing stub',
      browserNetwork: 'exact local GET/HEAD allowlist; all other requests fail qualification',
    },
    captures: [],
    defects: [],
  };

  let browser;
  let server;
  try {
    server = await listen(fixture.app);
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    manifest.runtime.browser = browser.version();

    for (const width of VISUAL_WIDTHS) {
      for (const scenario of SCENARIOS) {
        manifest.captures.push(
          await captureScenario({
            baseUrl,
            browser,
            scenario,
            token: fixture.token,
            width,
          }),
        );
      }
    }

    assert.equal(manifest.captures.length, VISUAL_WIDTHS.length * SCENARIOS.length);
    assert.deepEqual(fixture.mutationAttempts, []);
    assert.deepEqual(fixture.rpcPool.calls, []);
    assert.deepEqual(fixture.hiveReadService.unexpectedCalls, []);
    manifest.safety.fixtureReadCalls = fixture.hiveReadService.calls;
    manifest.result = 'passed';
  } catch (error) {
    manifest.result = 'failed';
    manifest.failure = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    throw error;
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
    await fs.writeFile(
      path.join(OUTPUT_ROOT, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    await writeIndex(manifest);
  }

  console.log(
    JSON.stringify({
      result: manifest.result,
      captures: manifest.captures.length,
      widths: VISUAL_WIDTHS,
      browser: manifest.runtime.browser,
      output: path.relative(ROOT, OUTPUT_ROOT),
    }),
  );
}

module.exports = {
  EXPECTED_INTENTIONAL_401_CONSOLE_ERROR,
  assertExpectedConsoleErrors,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
