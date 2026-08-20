'use strict';
/* global document, window */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { createUx1cVisualFixture } = require('../test/support/ux-1c-fixture');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.UX_1C_VISUAL_OUTPUT || 'artifacts/ux-1c-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const WIDTHS = Object.freeze([390, 1440]);
const HEIGHT = 900;
const ROOT_FORM = '.conversation-post form[data-vote-control]';
const COMMENT_FORM = '[data-comment-thread] form[data-vote-control]';
const SCENARIOS = Object.freeze([
  {
    id: 'root-neutral-100',
    path: '/post/etblink/welcome-fourth-street-bar',
    form: ROOT_FORM,
    direction: null,
    percent: 100,
    focus: null,
  },
  {
    id: 'root-upvote-50',
    path: '/post/etblink/welcome-fourth-street-bar',
    form: ROOT_FORM,
    direction: 'upvote',
    percent: 50,
    focus: 'strength',
    keyboardAdjustment: true,
  },
  {
    id: 'root-downvote-25',
    path: '/post/etblink/welcome-fourth-street-bar',
    form: ROOT_FORM,
    direction: 'downvote',
    percent: 25,
    focus: 'direction',
  },
  {
    id: 'comment-downvote-50-isolated',
    path: '/post/etblink/welcome-fourth-street-bar',
    form: COMMENT_FORM,
    direction: 'downvote',
    percent: 50,
    focus: 'strength',
  },
]);
const KEYCHAIN_STUB = `'use strict'; Object.defineProperty(window, '__UX_1C_KEYCHAIN_DISABLED__', { value: true }); window.HiveBarKeychain = Object.freeze({ KeychainAdapter: class { async broadcast() { throw new Error('UX-1C visual qualification forbids Keychain signing'); } } });`;
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

async function prepareScenario(page, scenario) {
  const form = page.locator(scenario.form).first();
  await assert.equal(await form.count(), 1);
  const strength = form.locator('[data-vote-strength]');
  let keyboardAdjusted = false;
  if (scenario.direction) {
    await form.locator(
      `label:has([data-vote-direction][value="${scenario.direction}"]) .vote-direction-option__surface`,
    ).click();
  }
  if (scenario.keyboardAdjustment) {
    await strength.fill(String(scenario.percent + 1));
    await strength.focus();
    await page.keyboard.press('ArrowLeft');
    keyboardAdjusted = true;
  } else if (scenario.percent !== 100) {
    await strength.fill(String(scenario.percent));
  }
  if (scenario.focus === 'direction') {
    await form.locator(`[data-vote-direction][value="${scenario.direction}"]`).focus();
  } else if (scenario.focus === 'strength') {
    await strength.focus();
  }
  return keyboardAdjusted;
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
  const keyboardAdjusted = await prepareScenario(page, scenario);
  await settleCaptureViewport(page);

  const evidence = await page.evaluate(({ formSelector, scenarioId }) => {
    const voteForms = Array.from(document.querySelectorAll('form[data-vote-control]'));
    const target = document.querySelector(formSelector);
    const targetIndex = voteForms.indexOf(target);
    const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const brokenLabels = voteForms.flatMap((form) => {
      const errors = [];
      for (const radio of form.querySelectorAll('[data-vote-direction]')) {
        if (!radio.closest('label')?.textContent.trim()) errors.push(radio.id || radio.value);
      }
      const strength = form.querySelector('[data-vote-strength]');
      if (!strength?.id || !form.querySelector(`label[for="${strength.id}"]`)) {
        errors.push(strength?.id || 'strength');
      }
      return errors;
    });
    const brokenDescriptions = voteForms.flatMap((form) =>
      Array.from(form.querySelectorAll('[aria-describedby]')).flatMap((control) =>
        (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
          .filter((id) => !document.getElementById(id))
          .map((id) => `${control.id || control.tagName}->${id}`)));
    const statusOwnershipErrors = voteForms.filter((form) => {
      const status = form.querySelector('[data-social-status]');
      return !status || status.closest('[data-vote-control]') !== form;
    }).map((form) => form.querySelector('[name="permlink"]')?.value || 'unknown');
    const tapTargetErrors = voteForms.flatMap((form) => [
      ...Array.from(form.querySelectorAll('.vote-direction-option__surface')),
      form.querySelector('[data-vote-strength]'),
      form.querySelector('[data-vote-review]'),
    ].filter(Boolean).filter((control) => control.getBoundingClientRect().height < 43.5)
      .map((control) => control.id || control.className));
    const states = voteForms.map((form) => {
      const checked = form.querySelector('[data-vote-direction]:checked');
      const strength = form.querySelector('[data-vote-strength]');
      return {
        author: form.querySelector('[name="author"]')?.value || null,
        permlink: form.querySelector('[name="permlink"]')?.value || null,
        direction: checked?.value || null,
        selectedCount: form.querySelectorAll('[data-vote-direction]:checked').length,
        requiredDirections: Array.from(form.querySelectorAll('[data-vote-direction]'))
          .every((input) => input.required),
        percent: strength?.value || null,
        min: strength?.min || null,
        max: strength?.max || null,
        step: strength?.step || null,
        valueText: strength?.getAttribute('aria-valuetext') || null,
        output: form.querySelector('[data-vote-percent]')?.textContent.trim() || null,
        reviewLabel: form.querySelector('[data-vote-review]')?.textContent.trim() || null,
        state: form.dataset.voteDirectionState || null,
        status: form.querySelector('[data-social-status]')?.textContent.trim() || '',
      };
    });
    return {
      activeElementId: document.activeElement?.id || null,
      brokenDescriptions,
      brokenLabels,
      duplicateIds,
      formCount: voteForms.length,
      keychainDisabled: globalThis.__UX_1C_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      otherForms: states.filter((_state, index) => index !== targetIndex),
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      scenario: scenarioId,
      scrollY: window.scrollY,
      statusOwnershipErrors,
      tapTargetErrors,
      target: states[targetIndex] || null,
    };
  }, { formSelector: scenario.form, scenarioId: scenario.id });
  evidence.keyboardAdjusted = keyboardAdjusted;

  assert.equal(evidence.formCount, 2);
  assert.equal(evidence.keychainDisabled, true);
  assert.equal(evidence.nativeKeychain, false);
  assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
  assert.equal(evidence.scrollY, 0);
  assert.deepEqual(evidence.duplicateIds, []);
  assert.deepEqual(evidence.brokenLabels, []);
  assert.deepEqual(evidence.brokenDescriptions, []);
  assert.deepEqual(evidence.statusOwnershipErrors, []);
  assert.deepEqual(evidence.tapTargetErrors, []);
  assert.ok(evidence.target);
  assert.equal(evidence.target.direction, scenario.direction);
  assert.equal(evidence.target.selectedCount, scenario.direction ? 1 : 0);
  assert.equal(evidence.target.requiredDirections, true);
  assert.equal(evidence.target.percent, String(scenario.percent));
  assert.equal(evidence.target.min, '1');
  assert.equal(evidence.target.max, '100');
  assert.equal(evidence.target.step, '1');
  assert.equal(evidence.target.valueText, `${scenario.percent} percent`);
  assert.equal(evidence.target.output, `${scenario.percent}%`);
  assert.equal(
    evidence.target.reviewLabel,
    scenario.direction ? `Review ${scenario.direction}` : 'Review vote',
  );
  assert.equal(evidence.target.state, scenario.direction || 'neutral');
  assert.equal(evidence.target.status, '');
  assert.ok(evidence.otherForms.every((state) =>
    state.direction === null &&
    state.selectedCount === 0 &&
    state.percent === '100' &&
    state.output === '100%' &&
    state.reviewLabel === 'Review vote' &&
    state.state === 'neutral' &&
    state.status === ''));
  if (scenario.form === ROOT_FORM) {
    assert.equal(evidence.target.author, 'etblink');
    assert.equal(evidence.target.permlink, 'welcome-fourth-street-bar');
  } else {
    assert.equal(evidence.target.author, 'barfriend');
    assert.equal(evidence.target.permlink, 're-welcome-fourth-street-bar');
  }
  if (scenario.keyboardAdjustment) assert.equal(evidence.keyboardAdjusted, true);
  if (scenario.focus === 'strength') assert.match(evidence.activeElementId || '', /-percent$/);
  if (scenario.focus === 'direction') assert.match(evidence.activeElementId || '', /-downvote$/);
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
  const fixture = createUx1cVisualFixture();
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
    await fs.writeFile(path.join(OUTPUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
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
