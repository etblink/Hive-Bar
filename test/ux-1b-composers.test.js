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
  'post',
  'comment',
  'vote',
  'follow',
  'unfollow',
  'subscribe',
  'unsubscribe',
  'profile',
  'claim-rewards',
  'wall',
  'inbox',
  'thread',
];

function ux1bFixture({ populated = true } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    RATE_LIMIT_MAX: '1000',
    SESSION_SECRET,
  });
  const rpcPool = createUx1aRpc({ populated });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create('etblink');
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, config, cookie: `hive_bar_session=${token}` };
}

function documentFor(html) {
  return new JSDOM(html, { url: 'https://hive-bar.test/' }).window.document;
}

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
    assert.equal(
      form.querySelectorAll(':scope [data-social-status], :scope [data-m4-status]').length,
      1,
    );
    for (const input of form.querySelectorAll('[data-composer-input]')) {
      assert.ok(input.id);
      assert.equal(form.querySelector(`label[for="${input.id}"]`)?.htmlFor, input.id);
      for (const descriptionId of (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)) {
        assert.ok(form.querySelector(`#${descriptionId}`), `${input.id} -> ${descriptionId}`);
      }
      const counter = input.closest('[data-composer-field]')?.querySelector('[data-byte-counter]');
      if (input.dataset.maxBytes) {
        assert.ok(counter);
        assert.equal(counter.closest('[data-composer-form]'), form);
      }
    }
    const submit = form.querySelector('button[type="submit"]');
    assert.ok(submit);
    assert.ok(submit.getAttribute('aria-describedby'));
  }
}

function hiddenValue(form, name) {
  return form.querySelector(`input[type="hidden"][name="${name}"]`)?.value;
}

test('UX-1B uses one data-driven presentation contract across active composer templates', () => {
  const sources = [
    'views/pages/community/partials/community-post-list.ejs',
    'views/pages/community/partials/community-thread-list.ejs',
    'views/partials/full-post.ejs',
    'views/common/comment.ejs',
    'views/pages/profile/partials/wall-posts.ejs',
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  const shared = [
    'views/common/composer.ejs',
    'views/common/composer/form.ejs',
    'views/common/composer/field.ejs',
  ].map((relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8')).join('\n');

  for (const source of sources) {
    assert.match(source, /include\([^\n]*common\/composer|include\('composer'/);
    assert.doesNotMatch(source, /<form[^>]+data-(?:social|m4)-action=/);
  }
  assert.match(shared, /data-composer=/);
  assert.match(shared, /data-composer-form=/);
  assert.match(shared, /data-composer-field=/);
  assert.match(shared, /data-composer-input/);
  assert.match(shared, /data-byte-counter/);
  assert.match(shared, /data-social-action="<%= composer\.action %>"/);
  assert.match(shared, /data-m4-action="<%= composer\.action %>"/);
});

test('UX-1B renders Community post and Thread composers with shared presentation and exact limits', async () => {
  const fixture = ux1bFixture();
  const [communityResponse, threadsResponse] = await Promise.all([
    request(fixture.app).get('/community').set('cookie', fixture.cookie).expect(200),
    request(fixture.app).get('/community/threads').set('cookie', fixture.cookie).expect(200),
  ]);
  const community = documentFor(communityResponse.text);
  const threads = documentFor(threadsResponse.text);

  assertUniqueAccessibleComposerContracts(community);
  assertUniqueAccessibleComposerContracts(threads);

  const post = community.querySelector('form[data-social-action="post"]');
  assert.ok(post);
  assert.equal(post.dataset.signerMode, 'keychain');
  assert.equal(post.querySelector('#new-post-title')?.dataset.maxBytes, '256');
  assert.equal(post.querySelector('#new-post-body')?.dataset.maxBytes, '32768');
  assert.ok(post.querySelector('#new-post-tags'));
  assert.equal(post.closest('details')?.hasAttribute('open'), false);
  assert.match(post.querySelector('button[type="submit"]')?.textContent || '', /Review post/);

  const thread = threads.querySelector('form[data-social-action="thread"]');
  assert.ok(thread);
  assert.equal(thread.dataset.signerMode, 'keychain');
  assert.equal(thread.querySelector('#new-thread-body')?.dataset.maxBytes, '500');
  assert.equal(thread.closest('details'), null);
  assert.match(thread.closest('[data-composer]')?.textContent || '', /Start a Thread/);
  assert.match(threads.body.textContent, /Who is stopping by the bar tonight/);
  assert.doesNotMatch(threads.body.textContent, /Technical Threads Container/);
});

test('UX-1B root and repeated reply composers keep exact parent semantics without duplicate IDs', async () => {
  const fixture = ux1bFixture();
  const response = await request(fixture.app)
    .get('/post/etblink/welcome-fourth-street-bar')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);
  assertUniqueAccessibleComposerContracts(document);

  const replies = Array.from(document.querySelectorAll('form[data-social-action="comment"]'));
  assert.equal(replies.length, 2);
  const root = replies.find((form) => form.dataset.composerForm === 'post-reply-composer');
  const nested = replies.find((form) => form.dataset.composerForm.startsWith('reply-composer-'));
  assert.ok(root);
  assert.ok(nested);
  assert.equal(hiddenValue(root, 'parentAuthor'), 'etblink');
  assert.equal(hiddenValue(root, 'parentPermlink'), 'welcome-fourth-street-bar');
  assert.equal(hiddenValue(nested, 'parentAuthor'), 'barfriend');
  assert.equal(hiddenValue(nested, 'parentPermlink'), 're-welcome-fourth-street-bar');
  assert.equal(root.querySelector('[name="body"]')?.dataset.maxBytes, '8192');
  assert.equal(nested.querySelector('[name="body"]')?.dataset.maxBytes, '8192');
  assert.equal(root.closest('details'), null);
  assert.equal(nested.closest('details')?.hasAttribute('open'), false);
});

test('UX-1B Wall composers share presentation while retaining distinct M4 actions, fees, and privacy copy', async () => {
  const fixture = ux1bFixture();
  const response = await request(fixture.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);
  assertUniqueAccessibleComposerContracts(document);

  const publicForm = document.querySelector('form[data-m4-action="wall"]');
  const privateForm = document.querySelector('form[data-m4-action="inbox"]');
  assert.ok(publicForm);
  assert.ok(privateForm);
  for (const form of [publicForm, privateForm]) {
    assert.equal(hiddenValue(form, 'recipient'), 'etblink');
    assert.equal(hiddenValue(form, 'expectedFee'), '1.000 HBD');
    assert.equal(hiddenValue(form, 'amount'), '1.000 HBD');
    assert.equal(form.hasAttribute('data-social-action'), false);
  }
  assert.equal(publicForm.querySelector('[name="message"]')?.dataset.maxBytes, '2000');
  assert.equal(privateForm.querySelector('[name="message"]')?.dataset.maxBytes, '1500');
  assert.equal(publicForm.closest('details'), null);
  assert.equal(privateForm.closest('details')?.hasAttribute('data-m18-private-composer'), true);
  assert.match(publicForm.textContent, /permanently public on Hive/i);
  assert.match(privateForm.textContent, /Keychain encrypts the message in this browser/);
  assert.match(privateForm.textContent, /message text stays private/i);
  assert.match(privateForm.textContent, /HBD amount, time, and transaction remain public on Hive/);
});

test('UX-1B composer pages validate while C2-A exposes only the reviewed profile action', async () => {
  const fixture = ux1bFixture();
  const paths = [
    '/community',
    '/community/threads',
    '/post/etblink/welcome-fourth-street-bar',
    '/profile/etblink/wall-posts',
  ];
  const validator = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: {
      'no-trailing-whitespace': 'off',
      'valid-id': 'off',
    },
  });
  for (const route of paths) {
    const response = await request(fixture.app).get(route).set('cookie', fixture.cookie).expect(200);
    const report = await validator.validateString(response.text);
    assert.equal(
      report.valid,
      true,
      report.results.flatMap((result) => result.messages)
        .map((message) => `${route} ${message.ruleId}: ${message.message}`).join('\n'),
    );
  }

  assert.deepEqual(BETA_ACTIONS, EXPECTED_BETA_ACTIONS);
  assert.equal(isBetaAction('thread'), true);
  assert.equal(isBetaAction('profile'), true);
  assert.equal(fixture.config.hive.writeMode, 'beta');
  assert.equal(fixture.config.hive.betaSelfSigningEnabled, true);
  assert.equal(fixture.config.hive.v1SelfSigningEnabled, false);
  assert.equal(fixture.app.locals.canWriteAction('thread'), true);
  assert.equal(fixture.app.locals.canWriteAction('profile'), true);
  assert.equal(V1_ACTIONS.includes('profile'), true);
});
