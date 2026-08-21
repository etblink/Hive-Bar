'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { HtmlValidate } = require('html-validate');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { BETA_ACTIONS, isBetaAction } = require('../src/beta/actions');
const { V1_ACTIONS } = require('../src/v1/actions');
const { configFrom, logger } = require('./support/test-app');
const { createUx1aRpc } = require('./support/ux-1a-fixture');

const ROOT = path.join(__dirname, '..');
const SESSION_SECRET = 'ux-1b-composer-session-secret-that-is-at-least-32-bytes';
const EXPECTED_BETA_ACTIONS = [
  'post', 'comment', 'vote', 'follow', 'unfollow', 'subscribe', 'unsubscribe',
  'profile', 'claim-rewards', 'wall', 'inbox', 'thread',
];

function ux1bFixture({ populated = true, account = 'etblink' } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain', RATE_LIMIT_MAX: '1000', SESSION_SECRET,
  });
  const rpcPool = createUx1aRpc({ populated });
  const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
  const { token } = sessionStore.create(account);
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, config, cookie: `hive_bar_session=${token}` };
}

function documentFor(html) { return new JSDOM(html, { url: 'https://hive-bar.test/' }).window.document; }

function assertUniqueAccessibleComposerContracts(document) {
  const composers = Array.from(document.querySelectorAll('[data-composer]'));
  assert.ok(composers.length > 0);
  const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate IDs: ${ids.join(', ')}`);
  for (const composer of composers) {
    const form = composer.querySelector(':scope form[data-composer-form]');
    assert.ok(form, composer.dataset.composer);
    assert.equal(form.dataset.composerForm, composer.dataset.composer);
    assert.ok(form.classList.contains('composer__form'));
    assert.equal(form.querySelectorAll(':scope [data-social-status], :scope [data-m4-status]').length, 1);
    for (const input of form.querySelectorAll('[data-composer-input]')) {
      assert.ok(input.id);
      const explicitLabel = form.querySelector(`label[for="${input.id}"]`);
      const wrappingLabel = input.closest('label');
      assert.ok(explicitLabel || wrappingLabel, input.id);
      if (explicitLabel) assert.equal(explicitLabel.htmlFor, input.id);
      if (!explicitLabel) assert.equal(wrappingLabel?.contains(input), true, input.id);
      for (const descriptionId of (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)) {
        assert.ok(form.querySelector(`#${descriptionId}`), `${input.id} -> ${descriptionId}`);
      }
      if (input.dataset.maxBytes) {
        const counter = input.closest('[data-composer-field]')?.querySelector('[data-byte-counter]');
        assert.ok(counter);
        assert.equal(counter.closest('[data-composer-form]'), form);
      }
    }
    const submit = form.querySelector('button[type="submit"]');
    assert.ok(submit);
    assert.ok(submit.getAttribute('aria-describedby'));
    const dialog = composer.querySelector(':scope > dialog[data-composer-dialog]');
    if (dialog) {
      const trigger = composer.querySelector(':scope > [data-composer-dialog-trigger]');
      assert.ok(trigger);
      assert.equal(trigger.getAttribute('aria-controls'), dialog.id);
      assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
      assert.ok(trigger.getAttribute('aria-label') || trigger.textContent.trim());
      assert.ok(dialog.getAttribute('aria-labelledby'));
      assert.ok(dialog.querySelector('[data-composer-dialog-close]'));
      assert.equal(composer.querySelector(':scope > form[data-composer-form]'), null);
    }
  }
}

function hiddenValue(form, name) { return form.querySelector(`input[type="hidden"][name="${name}"]`)?.value; }

function assertFocusedComposer(form) {
  const composer = form.closest('[data-composer]');
  const dialog = form.closest('dialog[data-composer-dialog]');
  assert.ok(composer);
  assert.ok(dialog);
  assert.equal(dialog.parentElement, composer);
  assert.ok(composer.querySelector(':scope > [data-composer-dialog-trigger]'));
  assert.equal(composer.querySelector(':scope > form[data-composer-form]'), null);
}

function assertCompactPlusLauncher(form, label) {
  const composer = form.closest('[data-composer]');
  const trigger = composer.querySelector(':scope > button[data-composer-dialog-trigger]');
  assert.ok(trigger);
  assert.equal(trigger.getAttribute('aria-label'), label);
  assert.equal(trigger.getAttribute('title'), label);
  assert.equal(trigger.textContent.trim(), '+');
  assert.ok(trigger.classList.contains('composer__dialog-trigger--icon'));
  assert.ok(composer.closest('.composer-toolbar'));
}

test('UX-1B keeps one shared composer contract while C2-B.1 adds compact launchers and Wall privacy state', () => {
  const sources = [
    'views/pages/community/partials/community-post-list.ejs',
    'views/pages/community/partials/community-thread-list.ejs',
    'views/partials/full-post.ejs',
    'views/common/comment.ejs',
    'views/pages/profile/partials/wall-posts.ejs',
    'views/pages/profile/partials/user-blog-posts.ejs',
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const shared = [
    'views/common/composer.ejs', 'views/common/composer/form.ejs', 'views/common/composer/field.ejs',
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8')).join('\n');
  for (const source of sources) {
    assert.match(source, /include\([^\n]*common\/composer|include\('composer'/);
    assert.doesNotMatch(source, /<form[^>]+data-(?:social|m4)-action=/);
  }
  assert.match(shared, /data-composer-dialog/);
  assert.match(shared, /data-composer-dialog-trigger/);
  assert.match(shared, /data-composer-form=/);
  assert.match(shared, /data-composer-input/);
  assert.match(shared, /field\.type === 'select'/);
  assert.match(shared, /field\.type === 'checkbox'/);
  assert.match(shared, /data-wall-privacy-form/);
});

test('C2-B.1 Community, owner Profile, and Threads use compact plus launchers with focused dialogs', async () => {
  const fixture = ux1bFixture();
  const [communityResponse, profileResponse, threadsResponse] = await Promise.all([
    request(fixture.app).get('/community').set('cookie', fixture.cookie).expect(200),
    request(fixture.app).get('/profile/etblink').set('cookie', fixture.cookie).expect(200),
    request(fixture.app).get('/community/threads').set('cookie', fixture.cookie).expect(200),
  ]);
  const community = documentFor(communityResponse.text);
  const profile = documentFor(profileResponse.text);
  const threads = documentFor(threadsResponse.text);
  assertUniqueAccessibleComposerContracts(community);
  assertUniqueAccessibleComposerContracts(profile);
  assertUniqueAccessibleComposerContracts(threads);

  const communityPost = community.querySelector('form[data-social-action="post"]');
  const profilePost = profile.querySelector('form[data-social-action="post"]');
  const thread = threads.querySelector('form[data-social-action="thread"]');
  for (const form of [communityPost, profilePost, thread]) {
    assert.ok(form);
    assert.equal(form.dataset.signerMode, 'keychain');
    assertFocusedComposer(form);
  }
  assertCompactPlusLauncher(communityPost, 'Create post');
  assertCompactPlusLauncher(profilePost, 'Create post');
  assertCompactPlusLauncher(thread, 'Start a Thread');

  assert.equal(communityPost.querySelector('[name="destination"]').value, 'community');
  assert.deepEqual(Array.from(communityPost.querySelector('[name="destination"]').options, ({ value }) => value), ['community', 'profile']);
  assert.equal(profilePost.querySelector('[name="destination"]').value, 'profile');
  assert.deepEqual(Array.from(profilePost.querySelector('[name="destination"]').options, ({ value }) => value), ['profile', 'community']);
  assert.equal(thread.querySelector('#new-thread-body')?.dataset.maxBytes, '500');
});

test('C2-B root and nested Reply dialogs preserve exact parent semantics without duplicate IDs', async () => {
  const fixture = ux1bFixture();
  const response = await request(fixture.app).get('/post/etblink/welcome-fourth-street-bar').set('cookie', fixture.cookie).expect(200);
  const document = documentFor(response.text);
  assertUniqueAccessibleComposerContracts(document);
  const replies = Array.from(document.querySelectorAll('form[data-social-action="comment"]'));
  assert.equal(replies.length, 2);
  const root = replies.find((form) => form.dataset.composerForm === 'post-reply-composer');
  const nested = replies.find((form) => form.dataset.composerForm.startsWith('reply-composer-'));
  assert.ok(root); assert.ok(nested);
  assertFocusedComposer(root); assertFocusedComposer(nested);
  assert.equal(hiddenValue(root, 'parentAuthor'), 'etblink');
  assert.equal(hiddenValue(root, 'parentPermlink'), 'welcome-fourth-street-bar');
  assert.equal(hiddenValue(nested, 'parentAuthor'), 'barfriend');
  assert.equal(hiddenValue(nested, 'parentPermlink'), 're-welcome-fourth-street-bar');
  assert.equal(root.querySelector('[name="body"]')?.dataset.maxBytes, '8192');
  assert.equal(nested.querySelector('[name="body"]')?.dataset.maxBytes, '8192');
});

test('C2-B.1 Wall renders one focused M4 composer with privacy toggle and exact fee bindings', async () => {
  const fixture = ux1bFixture();
  const response = await request(fixture.app).get('/profile/etblink/wall-posts').set('cookie', fixture.cookie).expect(200);
  const document = documentFor(response.text);
  assertUniqueAccessibleComposerContracts(document);
  const forms = Array.from(document.querySelectorAll('form[data-wall-privacy-form]'));
  assert.equal(forms.length, 1);
  const form = forms[0];
  assertFocusedComposer(form);
  assert.equal(form.dataset.m4Action, 'wall');
  assert.equal(form.dataset.wallEnabled, 'true');
  assert.equal(form.dataset.inboxEnabled, 'true');
  assert.equal(hiddenValue(form, 'recipient'), 'etblink');
  assert.equal(hiddenValue(form, 'expectedFee'), '1.000 HBD');
  assert.equal(hiddenValue(form, 'amount'), '1.000 HBD');
  assert.equal(form.hasAttribute('data-social-action'), false);
  assert.equal(form.querySelector('[data-wall-privacy-toggle]')?.checked, false);
  assert.equal(form.querySelector('[data-wall-privacy-message]')?.dataset.maxBytes, '2000');
  assert.match(form.textContent, /Encrypt this message \(private\)/);
  assert.match(form.textContent, /Unchecked messages are public on Hive/);
  assert.match(form.textContent, /permanently public on Hive/i);
  assert.equal(document.querySelectorAll('form[data-m4-action="inbox"]').length, 0);
});

test('UX-1B composer pages validate while C2-A/C2-B.1 keep the 12-action beta boundary and V1 dormant', async () => {
  const fixture = ux1bFixture();
  const paths = ['/community', '/community/threads', '/post/etblink/welcome-fourth-street-bar', '/profile/etblink', '/profile/etblink/wall-posts'];
  const validator = new HtmlValidate({ extends: ['html-validate:recommended'], rules: { 'no-trailing-whitespace': 'off', 'valid-id': 'off' } });
  for (const route of paths) {
    const response = await request(fixture.app).get(route).set('cookie', fixture.cookie).expect(200);
    const report = await validator.validateString(response.text);
    assert.equal(report.valid, true, report.results.flatMap((result) => result.messages).map((message) => `${route} ${message.ruleId}: ${message.message}`).join('\n'));
  }
  assert.deepEqual(BETA_ACTIONS, EXPECTED_BETA_ACTIONS);
  assert.equal(isBetaAction('thread'), true);
  assert.equal(isBetaAction('profile'), true);
  assert.equal(fixture.config.hive.writeMode, 'beta');
  assert.equal(fixture.config.hive.v1SelfSigningEnabled, false);
  assert.equal(V1_ACTIONS.length, 12);
});
