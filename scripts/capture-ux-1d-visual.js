'use strict';
/* global document, window */

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { createUx1dVisualFixture } = require('../test/support/ux-1d-fixture');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.resolve(ROOT, process.env.UX_1D_VISUAL_OUTPUT || 'artifacts/ux-1d-visual');
const SHOTS = path.join(OUTPUT, 'screenshots');
const WIDTHS = Object.freeze([390, 1440]);
const HEIGHT = 900;
const SCENARIOS = Object.freeze([
  { id: 'community-posts-composer-active', path: '/community' },
  { id: 'threads-multiple-composer-active', path: '/community/threads' },
  { id: 'conversation-nested-replies', path: '/post/etblink/opening-night-update' },
]);
const KEYCHAIN_STUB = `'use strict'; Object.defineProperty(window, '__UX_1D_KEYCHAIN_DISABLED__', { value: true }); window.HiveBarKeychain = Object.freeze({ KeychainAdapter: class { async broadcast() { throw new Error('UX-1D visual qualification forbids Keychain signing'); } } });`;
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

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
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

async function setRange(range, value) {
  await range.evaluate((element, nextValue) => {
    element.value = String(nextValue);
    element.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
  }, value);
}

async function prepareScenario(page, scenario) {
  if (scenario.id === 'community-posts-composer-active') {
    const composer = page.locator('#community-post-composer');
    await composer.locator(':scope > summary').click();
    await composer.locator('input[name="title"]').fill('A quick update from the bar');
    await composer.locator('textarea[name="body"]').fill('The patio is ready. Who is joining the conversation tonight?');
    await composer.locator('textarea[name="body"]').focus();
    return;
  }
  if (scenario.id === 'threads-multiple-composer-active') {
    const composer = page.locator('#thread-composer');
    await composer.locator('textarea[name="body"]').fill('Anyone stopping by after work?');
    await composer.locator('textarea[name="body"]').focus();
    return;
  }
  const rootComposer = page.locator('#post-reply-composer');
  await rootComposer.locator('[data-composer-dialog-trigger]').click();
  await rootComposer.locator('textarea[name="body"]').fill('Looking forward to seeing everyone tonight.');
  await rootComposer.locator('[data-composer-dialog-close]').click();
  const nestedVote = page.locator('.conversation-thread .social-comment[data-comment-depth="3"] form[data-vote-control]').first();
  await nestedVote.locator('[data-vote-open="downvote"]').click();
  await setRange(nestedVote.locator('[data-vote-strength]'), 50);
  await nestedVote.locator('[data-vote-strength]').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
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
  await prepareScenario(page, scenario);
  await settleCaptureViewport(page);

  const evidence = await page.evaluate((scenarioId) => {
    const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    const actionForms = Array.from(document.querySelectorAll('form[data-social-action]'));
    const brokenDescriptions = actionForms.flatMap((form) =>
      Array.from(form.querySelectorAll('[aria-describedby]')).flatMap((control) =>
        (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
          .filter((id) => !document.getElementById(id))
          .map((id) => `${control.id || control.name || control.tagName}->${id}`)));
    const statusOwnershipErrors = actionForms.filter((form) => {
      const status = form.querySelector('[data-social-status]');
      return !status || status.closest('form') !== form;
    }).map((form) => form.dataset.socialAction || 'unknown');
    const visible = (control) => {
      const rect = control.getBoundingClientRect();
      const style = window.getComputedStyle(control);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const tapTargetErrors = Array.from(document.querySelectorAll([
      '[data-vote-open]',
      '[data-vote-strength]',
      '[data-vote-review]',
      '[data-vote-close]',
      '.community-sort__select',
      '.community-sort__submit',
      '[data-composer-dialog-trigger]',
    ].join(','))).filter(visible).filter((control) => control.getBoundingClientRect().height < 43.5)
      .map((control) => control.id || control.dataset.voteOpen || control.className);
    const voteTargets = Array.from(document.querySelectorAll('form[data-vote-control]'), (form) => ({
      author: form.querySelector('[name="author"]')?.value || null,
      permlink: form.querySelector('[name="permlink"]')?.value || null,
      direction: form.querySelector('[data-vote-direction-value]')?.value || null,
      percent: form.querySelector('[data-vote-strength]')?.value || null,
      dialogOpen: Boolean(form.querySelector('[data-vote-dialog]')?.open),
      statusOwner: form.querySelector('[data-social-status]')?.closest('form') === form,
    }));
    const comments = Array.from(document.querySelectorAll('.social-comment'), (comment) => {
      const style = window.getComputedStyle(comment);
      const vote = comment.querySelector(':scope > .social-comment__activity form[data-vote-control]');
      const reply = comment.querySelector(':scope > [data-composer] form[data-social-action="comment"]');
      return {
        author: vote?.querySelector('[name="author"]')?.value || null,
        background: style.backgroundColor,
        borderRadius: style.borderRadius,
        depth: Number(comment.dataset.commentDepth),
        left: Math.round(comment.getBoundingClientRect().left * 10) / 10,
        parentAuthor: reply?.querySelector('[name="parentAuthor"]')?.value || null,
        parentPermlink: reply?.querySelector('[name="parentPermlink"]')?.value || null,
        permlink: vote?.querySelector('[name="permlink"]')?.value || null,
        presentation: comment.classList.contains('social-comment--thread') ? 'thread' : 'conversation',
      };
    });
    const firstPost = document.querySelector('.social-feed .social-post');
    const firstPostStyle = firstPost ? window.getComputedStyle(firstPost) : null;
    const top = (selector, root = document) => root.querySelector(selector)?.getBoundingClientRect().top ?? null;
    const firstPostOrder = firstPost ? {
      activity: top('.social-post__activity', firstPost),
      author: top(':scope > .social-author', firstPost),
      content: top('.social-post__content', firstPost),
    } : null;
    const focusStyle = document.activeElement ? window.getComputedStyle(document.activeElement) : null;
    return {
      activeElement: document.activeElement?.id || document.activeElement?.name || null,
      activeFocusVisible: Boolean(document.activeElement?.matches(':focus-visible')),
      activeOutlineStyle: focusStyle?.outlineStyle || null,
      brokenDescriptions,
      comments,
      composerCount: document.querySelectorAll('[data-composer]').length,
      containerExposed: document.body.textContent.includes('Technical Threads Container — Do Not Display'),
      duplicateIds,
      feedItemCount: document.querySelectorAll('.social-feed > .social-feed-item').length,
      firstPostOrder,
      firstPostSurface: firstPostStyle ? {
        background: firstPostStyle.backgroundColor,
        borderRadius: firstPostStyle.borderRadius,
      } : null,
      keychainDisabled: globalThis.__UX_1D_KEYCHAIN_DISABLED__ === true,
      nativeKeychain: Boolean(globalThis.hive_keychain),
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      replyParentErrors: comments.filter((comment) =>
        comment.author !== comment.parentAuthor || comment.permlink !== comment.parentPermlink),
      scenario: scenarioId,
      scrollY: window.scrollY,
      sort: (() => {
        const form = document.querySelector('form.community-sort');
        return form ? {
          action: form.getAttribute('action'),
          hxGet: form.getAttribute('hx-get'),
          hxTarget: form.getAttribute('hx-target'),
          method: form.getAttribute('method'),
          options: Array.from(form.querySelectorAll('option'), ({ value }) => value),
        } : null;
      })(),
      statusOwnershipErrors,
      tapTargetErrors,
      threadItemCount: document.querySelectorAll('.thread-feed > .social-comment--thread').length,
      voteTargets,
    };
  }, scenario.id);

  assert.equal(evidence.keychainDisabled, true);
  assert.equal(evidence.nativeKeychain, false);
  assert.ok(evidence.overflow <= 1, JSON.stringify(evidence));
  assert.equal(evidence.scrollY, 0);
  assert.deepEqual(evidence.duplicateIds, []);
  assert.deepEqual(evidence.brokenDescriptions, []);
  assert.deepEqual(evidence.statusOwnershipErrors, []);
  assert.deepEqual(evidence.tapTargetErrors, []);
  assert.deepEqual(evidence.replyParentErrors, []);
  assert.equal(evidence.containerExposed, false);
  assert.equal(evidence.activeFocusVisible, true);
  assert.notEqual(evidence.activeOutlineStyle, 'none');
  assert.ok(evidence.voteTargets.every(({ statusOwner }) => statusOwner));
  assert.ok(evidence.comments.every(({ background, borderRadius }) =>
    background === 'rgba(0, 0, 0, 0)' && borderRadius === '0px'));

  if (scenario.id === 'community-posts-composer-active') {
    assert.equal(evidence.feedItemCount, 4);
    assert.equal(evidence.composerCount, 1);
    assert.equal(evidence.voteTargets.length, 4);
    assert.deepEqual(evidence.sort, {
      action: '/community',
      hxGet: '/community/hive-108590/community-posts',
      hxTarget: '#community-feed',
      method: 'get',
      options: ['created', 'trending', 'hot', 'payout'],
    });
    assert.ok(evidence.firstPostOrder.author < evidence.firstPostOrder.content);
    assert.ok(evidence.firstPostOrder.content < evidence.firstPostOrder.activity);
    assert.equal(evidence.firstPostSurface.background, 'rgba(0, 0, 0, 0)');
    assert.equal(evidence.firstPostSurface.borderRadius, '0px');
    assert.equal(evidence.activeElement, 'new-post-body');
  } else if (scenario.id === 'threads-multiple-composer-active') {
    assert.equal(evidence.threadItemCount, 5);
    assert.deepEqual(evidence.comments.map(({ depth }) => depth), [1, 2, 3, 1, 1]);
    assert.ok(evidence.comments.every(({ presentation }) => presentation === 'thread'));
    assert.equal(evidence.activeElement, 'new-thread-body');
  } else {
    assert.equal(evidence.voteTargets.length, 5);
    assert.deepEqual(evidence.comments.map(({ depth }) => depth), [1, 2, 3, 1]);
    assert.ok(evidence.comments.every(({ presentation }) => presentation === 'conversation'));
    const [depthOne, depthTwo, depthThree] = evidence.comments;
    assert.ok(depthTwo.left > depthOne.left, JSON.stringify(evidence.comments));
    assert.ok(depthThree.left > depthTwo.left, JSON.stringify(evidence.comments));
    assert.ok(depthThree.left - depthOne.left <= (width === 390 ? 36 : 72));
    assert.match(evidence.activeElement || '', /-percent$/);
    const selected = evidence.voteTargets.find(({ permlink }) => permlink === 're-renolocal-opening-night');
    assert.deepEqual(selected, {
      author: 'etblink',
      permlink: 're-renolocal-opening-night',
      direction: 'downvote',
      percent: '50',
      dialogOpen: true,
      statusOwner: true,
    });
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
  const fixture = createUx1dVisualFixture();
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
