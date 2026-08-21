'use strict';
/* global document, window */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { createUx1bVisualFixture } = require('../test/support/ux-1b-fixture');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.UX_1B_VISUAL_OUTPUT || 'artifacts/ux-1b-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const WIDTHS = Object.freeze([390, 1440]);
const HEIGHT = 900;
const SCENARIOS = Object.freeze([
  {
    id: 'community-post-active',
    path: '/community',
    open: '#community-post-composer [data-composer-dialog-trigger]',
    input: '#new-post-body',
    value: 'Tonight’s pool table is open—pull up a stool and say hello.',
    action: 'post',
  },
  {
    id: 'thread-active',
    path: '/community/threads',
    open: '#thread-composer [data-composer-dialog-trigger]',
    input: '#new-thread-body',
    value: 'Anyone up for a game of pool tonight?',
    action: 'thread',
  },
  {
    id: 'nested-reply-active',
    path: '/post/etblink/welcome-fourth-street-bar',
    open: '[data-composer^="reply-composer-"] > summary',
    input: '[data-composer^="reply-composer-"] textarea[data-composer-input]',
    value: 'Glad you made it—see you at the bar.',
    action: 'comment',
  },
  {
    id: 'public-wall-active',
    path: '/profile/etblink/wall-posts',
    open: '#wall-message-composer [data-composer-dialog-trigger]',
    input: '#wall-message',
    value: 'Thanks for making everyone feel welcome at 4th Street Bar.',
    action: 'wall',
  },
  {
    id: 'private-message-active',
    path: '/profile/etblink/wall-posts',
    open: '#wall-message-composer [data-composer-dialog-trigger]',
    toggle: '#wall-encrypt-message',
    input: '#wall-message',
    value: 'Could you save me a seat near the pool table?',
    action: 'inbox',
  },
]);
const KEYCHAIN_STUB = `'use strict'; Object.defineProperty(window, '__UX_1B_KEYCHAIN_DISABLED__', { value: true }); window.HiveBarKeychain = Object.freeze({ KeychainAdapter: class { async broadcast() { throw new Error('UX-1B visual qualification forbids Keychain signing'); } async encodeMemo() { throw new Error('UX-1B visual qualification forbids Keychain encryption'); } async decodeMemo() { throw new Error('UX-1B visual qualification forbids Keychain decryption'); } } });`;
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

async function settleCaptureViewport(page) {
  await page.addStyleTag({
    content: 'html{scroll-behavior:auto!important;overflow-anchor:none!important}*{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}',
  });
  await page.evaluate(async () => document.fonts.ready);
  await page.evaluate(() => new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      window.requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        resolve();
      });
    });
  }));
}

function assertSafeOutputRoot() {
  const relative = path.relative(ROOT, OUTPUT);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

async function capture({ baseUrl, browser, scenario, token, width }) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    colorScheme: 'dark',
    locale: 'en-US',
  });
  const origin = new URL(baseUrl).origin;
  const outboundBlockedOrSubstituted = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      outboundBlockedOrSubstituted.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
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
  assert.equal(response.status(), 200);
  if (scenario.open) await page.locator(scenario.open).click();
  if (scenario.toggle) await page.locator(scenario.toggle).check();
  await page.locator(scenario.input).fill(scenario.value);
  await page.locator(scenario.input).focus();
  await settleCaptureViewport(page);

  const evidence = await page.evaluate(({ action, inputSelector, scenarioId }) => {
    const target = document.querySelector(inputSelector);
    const targetForm = target?.closest('[data-composer-form]');
    const targetField = target?.closest('[data-composer-field]');
    const targetCounter = targetField?.querySelector('[data-byte-counter]');
    const targetDialog = target?.closest('dialog[data-composer-dialog]');
    const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const composerControls = Array.from(document.querySelectorAll('[data-composer-input]'));
    const brokenLabels = composerControls
      .filter((control) => {
        if (!control.id) return true;
        const explicitLabel = document.querySelector(`label[for="${control.id}"]`);
        const wrappingLabel = control.closest('label');
        return !explicitLabel && !wrappingLabel;
      })
      .map((control) => control.id || control.name);
    const brokenDescriptions = composerControls.flatMap((control) =>
      (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
        .filter((id) => !document.getElementById(id))
        .map((id) => `${control.id}->${id}`));
    const counterOwnershipErrors = composerControls.filter((control) => {
      if (!control.dataset.maxBytes) return false;
      const field = control.closest('[data-composer-field]');
      const form = control.closest('[data-composer-form]');
      const counter = field?.querySelector('[data-byte-counter]');
      return !counter || counter.closest('[data-composer-form]') !== form;
    }).map((control) => control.id);
    const statusOwnershipErrors = Array.from(document.querySelectorAll('[data-composer-form]'))
      .filter((form) => {
        const statuses = form.querySelectorAll(':scope [data-social-status], :scope [data-m4-status]');
        return statuses.length !== 1 || statuses[0].closest('[data-composer-form]') !== form;
      }).map((form) => form.dataset.composerForm);
    const untouchedCounters = composerControls
      .filter((control) => control !== target && control.dataset.maxBytes)
      .map((control) => ({
        id: control.id,
        text: control.closest('[data-composer-field]')?.querySelector('[data-byte-counter]')
          ?.textContent.trim() || '',
      }));
    return {
      action,
      activeElement: document.activeElement?.id || null,
      brokenDescriptions,
      brokenLabels,
      composerCount: document.querySelectorAll('[data-composer]').length,
      counterOwnershipErrors,
      duplicateIds,
      hiddenAmount: targetForm?.querySelector('[name="amount"]')?.value || null,
      hiddenExpectedFee: targetForm?.querySelector('[name="expectedFee"]')?.value || null,
      hiddenParentAuthor: targetForm?.querySelector('[name="parentAuthor"]')?.value || null,
      hiddenParentPermlink: targetForm?.querySelector('[name="parentPermlink"]')?.value || null,
      hiddenRecipient: targetForm?.querySelector('[name="recipient"]')?.value || null,
      keychainDisabled: globalThis.__UX_1B_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      privacyChecked: targetForm?.querySelector('[data-wall-privacy-toggle]')?.checked ?? null,
      privacyMode: targetForm?.dataset.wallPrivacyMode || null,
      scenario: scenarioId,
      scrollY: window.scrollY,
      signerMode: targetForm?.dataset.signerMode || null,
      statusOwnershipErrors,
      targetAction: targetForm?.dataset.socialAction || targetForm?.dataset.m4Action || null,
      targetCounter: targetCounter?.textContent.trim() || null,
      targetCounterOwned: targetCounter?.closest('[data-composer-form]') === targetForm,
      targetDialogOpen: targetDialog ? targetDialog.open : null,
      targetValue: target?.value || null,
      technicalContainer: document.body.textContent.includes('Technical Threads Container — Do Not Display'),
      untouchedCounters,
    };
  }, { action: scenario.action, inputSelector: scenario.input, scenarioId: scenario.id });

  assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
  assert.equal(evidence.keychainDisabled, true);
  assert.equal(evidence.nativeKeychain, false);
  assert.ok(evidence.composerCount > 0);
  assert.deepEqual(evidence.duplicateIds, []);
  assert.deepEqual(evidence.brokenLabels, []);
  assert.deepEqual(evidence.brokenDescriptions, []);
  assert.deepEqual(evidence.counterOwnershipErrors, []);
  assert.deepEqual(evidence.statusOwnershipErrors, []);
  assert.equal(evidence.scrollY, 0);
  assert.equal(evidence.targetAction, scenario.action);
  assert.equal(evidence.targetValue, scenario.value);
  assert.equal(evidence.activeElement, await page.locator(scenario.input).getAttribute('id'));
  assert.equal(evidence.targetCounterOwned, true);
  assert.match(evidence.targetCounter, new RegExp(`^${Buffer.byteLength(scenario.value, 'utf8')} / `));
  assert.ok(evidence.untouchedCounters.every(({ text }) => text.startsWith('0 / ')));
  assert.equal(evidence.technicalContainer, false);
  assert.equal(evidence.targetDialogOpen, true);
  if (scenario.id === 'nested-reply-active') {
    assert.equal(evidence.hiddenParentAuthor, 'barfriend');
    assert.equal(evidence.hiddenParentPermlink, 're-welcome-fourth-street-bar');
  }
  if (scenario.id === 'public-wall-active' || scenario.id === 'private-message-active') {
    assert.equal(evidence.hiddenRecipient, 'etblink');
    assert.equal(evidence.hiddenExpectedFee, '1.000 HBD');
    assert.equal(evidence.hiddenAmount, '1.000 HBD');
    assert.equal(evidence.privacyMode, scenario.id === 'private-message-active' ? 'private' : 'public');
    assert.equal(evidence.privacyChecked, scenario.id === 'private-message-active');
  }
  if (['post', 'thread', 'comment'].includes(scenario.action)) {
    assert.equal(evidence.signerMode, 'keychain');
  } else {
    assert.equal(evidence.signerMode, null);
  }
  assert.deepEqual(consoleErrors, []);

  const filename = path.join(SHOTS, `${String(width).padStart(4, '0')}-${scenario.id}.png`);
  const bytes = await page.screenshot({ path: filename, fullPage: true, animations: 'disabled' });
  await context.close();
  return {
    scenario: scenario.id,
    width,
    path: path.relative(OUTPUT, filename).split(path.sep).join('/'),
    sha256: sha256(bytes),
    evidence,
    outboundBlockedOrSubstituted,
  };
}

async function main() {
  assertSafeOutputRoot();
  const fixture = createUx1bVisualFixture();
  assert.equal(fixture.config.hive.writeMode, 'beta');
  assert.equal(fixture.config.hive.signerMode, 'keychain');
  assert.equal(fixture.config.hive.v1SelfSigningEnabled, false);
  await fs.rm(OUTPUT, { recursive: true, force: true });
  await fs.mkdir(SHOTS, { recursive: true });
  const server = await listen(fixture.app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const manifest = {
    schemaVersion: 1,
    result: 'running',
    git: { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') },
    widths: WIDTHS,
    scenarios: SCENARIOS.map(({ id }) => id),
    captures: [],
  };
  try {
    browser = await chromium.launch({ headless: true });
    for (const width of WIDTHS) {
      for (const scenario of SCENARIOS) {
        manifest.captures.push(await capture({
          baseUrl,
          browser,
          scenario,
          token: fixture.token,
          width,
        }));
      }
    }
    assert.equal(manifest.captures.length, WIDTHS.length * SCENARIOS.length);
    assert.deepEqual(fixture.mutationAttempts, []);
    manifest.result = 'passed';
  } catch (error) {
    manifest.result = 'failed';
    manifest.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    manifest.rpcCalls = fixture.rpcPool.calls;
    manifest.mutationAttempts = fixture.mutationAttempts;
    await fs.writeFile(
      path.join(OUTPUT, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await browser?.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
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
