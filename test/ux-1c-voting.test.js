'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { HtmlValidate } = require('html-validate');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { BETA_ACTIONS } = require('../src/beta/actions');
const { V1_ACTIONS } = require('../src/v1/actions');
const { configFrom, logger } = require('./support/test-app');
const { createUx1aRpc } = require('./support/ux-1a-fixture');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'ux-1c-voting-session-secret-that-is-at-least-32-bytes';
const EXPECTED_BETA_ACTIONS = [
  'post', 'comment', 'vote', 'follow', 'unfollow', 'subscribe', 'unsubscribe',
  'profile', 'claim-rewards', 'wall', 'inbox', 'thread',
];

function votingFixture({ account = 'etblink' } = {}) {
  const config = configFrom({ HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain', RATE_LIMIT_MAX: '1000', SESSION_SECRET });
  const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
  const { session, token } = sessionStore.create(account);
  const app = createApp({ config, logger, rpcPool: createUx1aRpc({ populated: true }), sessionStore });
  return { app, config, cookie: `hive_bar_session=${token}`, session };
}

function authorized(builder, fixture) {
  return builder.set('origin', ORIGIN).set('cookie', fixture.cookie).set('x-csrf-token', fixture.session.csrfToken);
}

function hiddenValue(form, name) { return form.querySelector(`input[type="hidden"][name="${name}"]`)?.value; }

test('C2-B root posts and comments render neutral thumb triggers with one contextual 1-100 vote dialog', async () => {
  const fixture = votingFixture();
  const response = await request(fixture.app).get('/post/etblink/welcome-fourth-street-bar').set('cookie', fixture.cookie).expect(200);
  const document = new JSDOM(response.text, { url: 'https://fourthstreetbar.com/' }).window.document;
  const forms = Array.from(document.querySelectorAll('form[data-social-action="vote"]'));
  assert.equal(forms.length, 2);
  const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate IDs: ${ids.join(', ')}`);

  for (const form of forms) {
    assert.equal(form.dataset.signerMode, 'keychain');
    assert.equal(form.dataset.voteDirectionState, 'neutral');
    assert.ok(hiddenValue(form, 'author'));
    assert.ok(hiddenValue(form, 'permlink'));
    assert.equal(hiddenValue(form, 'direction'), '');
    const triggers = Array.from(form.querySelectorAll('[data-vote-open]'));
    assert.deepEqual(triggers.map(({ dataset }) => dataset.voteOpen), ['upvote', 'downvote']);
    assert.deepEqual(triggers.map((button) => button.getAttribute('aria-label')), ['Upvote', 'Downvote']);
    assert.ok(triggers.every((button) => button.type === 'button' && button.getAttribute('aria-haspopup') === 'dialog'));
    const dialog = form.querySelector('dialog[data-vote-dialog]');
    assert.ok(dialog);
    assert.ok(dialog.getAttribute('aria-labelledby'));
    assert.ok(dialog.querySelector('[data-vote-close]'));
    const strength = dialog.querySelector('input[type="range"][name="percent"]');
    assert.ok(strength);
    assert.equal(strength.min, '1');
    assert.equal(strength.max, '100');
    assert.equal(strength.step, '1');
    assert.equal(strength.value, '100');
    assert.equal(strength.getAttribute('aria-valuetext'), '100 percent');
    assert.equal(dialog.querySelector(`label[for="${strength.id}"]`)?.textContent, 'Strength');
    assert.equal(dialog.querySelector(`output[for="${strength.id}"]`)?.textContent, '100%');
    assert.match(dialog.querySelector('[data-vote-review]')?.textContent || '', /Review vote/);
    assert.equal(form.querySelector('[data-vote-direction]'), null);
    assert.equal(form.querySelector('select[name="direction"]'), null);
  }

  const root = forms.find((form) => hiddenValue(form, 'permlink') === 'welcome-fourth-street-bar');
  const comment = forms.find((form) => hiddenValue(form, 'permlink') === 're-welcome-fourth-street-bar');
  assert.equal(hiddenValue(root, 'author'), 'etblink');
  assert.equal(hiddenValue(comment, 'author'), 'barfriend');

  const validator = new HtmlValidate({ extends: ['html-validate:recommended'], rules: { 'no-trailing-whitespace': 'off', 'valid-id': 'off' } });
  const report = await validator.validateString(response.text);
  assert.equal(report.valid, true, report.results.flatMap(({ messages }) => messages).map(({ ruleId, message }) => `${ruleId}: ${message}`).join('\n'));
});

test('beta preflight retains all six exact positive and negative Hive weight vectors', async () => {
  const fixture = votingFixture({ account: 'barfriend' });
  const vectors = [
    ['upvote', 100, 10000], ['upvote', 50, 5000], ['upvote', 1, 100],
    ['downvote', 100, -10000], ['downvote', 50, -5000], ['downvote', 1, -100],
  ];
  for (const [direction, percent, weight] of vectors) {
    const result = await authorized(request(fixture.app).post('/api/social/preflight/vote'), fixture)
      .send({ author: 'etblink', permlink: 'welcome-fourth-street-bar', direction, percent, voter: 'attacker' }).expect(201);
    assert.equal(result.body.account, 'barfriend');
    assert.equal(result.body.signer, 'barfriend');
    assert.equal(result.body.authority, 'Posting');
    assert.deepEqual(result.body.operations, [['vote', { voter: 'barfriend', author: 'etblink', permlink: 'welcome-fourth-street-bar', weight }]]);
    assert.equal(result.body.summary.direction, direction);
    assert.equal(result.body.summary.percent, percent);
    assert.equal(result.body.summary.weight, weight);
    assert.match(result.body.fingerprint, /^[0-9a-f]{64}$/);
    await authorized(request(fixture.app).post(`/api/social/preflight/${result.body.id}/cancel`), fixture).expect(204);
  }
});

test('UX-1C vote boundaries remain exact while C2-B changes presentation only', () => {
  const fixture = votingFixture();
  assert.deepEqual(BETA_ACTIONS, EXPECTED_BETA_ACTIONS);
  assert.equal(fixture.config.hive.writeMode, 'beta');
  assert.equal(fixture.app.locals.canWriteAction('vote'), true);
  assert.equal(fixture.app.locals.canWriteAction('thread'), true);
  assert.equal(fixture.app.locals.canWriteAction('profile'), true);
  assert.equal(fixture.config.hive.v1SelfSigningEnabled, false);
  assert.equal(V1_ACTIONS.length, 12);
  assert.equal(V1_ACTIONS.includes('profile'), true);
});
