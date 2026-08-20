'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { SessionStore } = require('../src/auth/session-store');
const { BETA_ACTIONS } = require('../src/beta/actions');
const { HiveReadService } = require('../src/hive/read-service');
const { V1_ACTIONS } = require('../src/v1/actions');
const { createApp } = require('../src/app');
const { configFrom, logger } = require('./support/test-app');
const { UX1D_CONTENT, createUx1dRpc } = require('./support/ux-1d-fixture');

const ROOT = path.join(__dirname, '..');
const EXPECTED_BETA_ACTIONS = [
  'post',
  'comment',
  'vote',
  'follow',
  'unfollow',
  'subscribe',
  'unsubscribe',
  'claim-rewards',
  'wall',
  'inbox',
  'thread',
];

function hierarchyFixture() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    RATE_LIMIT_MAX: '1000',
    SESSION_SECRET: 'ux-1d-hierarchy-session-secret-that-is-at-least-32-bytes',
  });
  const rpcPool = createUx1dRpc();
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create('etblink');
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, config, cookie: `hive_bar_session=${token}`, rpcPool, session };
}

function documentFor(html, url = 'https://fourthstreetbar.com/') {
  return new JSDOM(html, { url }).window.document;
}

function hiddenValue(form, name) {
  return form.querySelector(`input[type="hidden"][name="${name}"]`)?.value;
}

function assertUniqueIdsAndOwnedStatuses(document) {
  const ids = Array.from(document.querySelectorAll('[id]'), (element) => element.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate IDs: ${ids.join(', ')}`);
  for (const form of document.querySelectorAll('form[data-social-action]')) {
    const status = form.querySelector('[data-social-status]');
    assert.ok(status, `${form.dataset.socialAction} form has no owned status`);
    assert.equal(status.closest('form'), form);
    for (const described of form.querySelectorAll('[aria-describedby]')) {
      for (const id of described.getAttribute('aria-describedby').split(/\s+/).filter(Boolean)) {
        assert.ok(document.getElementById(id), `${described.id || described.name} -> ${id}`);
      }
    }
  }
}

test('Community feed keeps exact sort/HTMX contracts while presenting several shared hierarchy items', async () => {
  const fixture = hierarchyFixture();
  const response = await request(fixture.app)
    .get('/community')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);

  const sortForm = document.querySelector('form.community-sort');
  assert.ok(sortForm);
  assert.equal(sortForm.getAttribute('action'), '/community');
  assert.equal(sortForm.getAttribute('method'), 'get');
  assert.equal(sortForm.getAttribute('hx-get'), '/community/hive-108590/community-posts');
  assert.equal(sortForm.getAttribute('hx-target'), '#community-feed');
  assert.deepEqual(
    Array.from(sortForm.querySelectorAll('select[name="sort"] option'), ({ value }) => value),
    ['created', 'trending', 'hot', 'payout'],
  );
  assert.equal(sortForm.querySelector('option:checked')?.value, 'created');

  const items = Array.from(document.querySelectorAll('.social-feed > .social-feed-item'));
  assert.equal(items.length, 4);
  assert.equal(document.body.textContent.includes('Technical Threads Container — Do Not Display'), false);
  assert.match(document.body.textContent, /Community update: patio hours/);
  assert.ok(document.querySelector('form[data-social-action="post"]'));

  for (const item of items) {
    assert.ok(item.querySelector('.social-post__content .social-post__title'));
    assert.ok(item.querySelector('.social-post__content .social-post__excerpt'));
    assert.ok(item.querySelector('.social-post__activity .social-post__stats'));
    const postLink = item.querySelector('.social-post__title a');
    const authorLink = item.querySelector('.social-author__name');
    const vote = item.querySelector('form[data-social-action="vote"]');
    assert.equal(postLink.getAttribute('href'), `/post/${hiddenValue(vote, 'author')}/${hiddenValue(vote, 'permlink')}`);
    assert.equal(authorLink.getAttribute('href'), `/profile/${hiddenValue(vote, 'author')}`);
  }
  assertUniqueIdsAndOwnedStatuses(document);

  const htmx = await request(fixture.app)
    .get('/community/hive-108590/community-posts?sort=hot')
    .set('HX-Request', 'true')
    .set('cookie', fixture.cookie)
    .expect(200);
  const htmxDocument = documentFor(htmx.text);
  assert.equal(htmxDocument.querySelector('select[name="sort"] option:checked')?.value, 'hot');
  const rankedCall = fixture.rpcPool.calls.filter(({ api, method }) =>
    api === 'bridge' && method === 'get_ranked_posts').at(-1);
  assert.equal(rankedCall.params.sort, 'hot');
  assert.equal(rankedCall.params.tag, 'hive-108590');
});

test('container filtering and pagination remain correct after presentation-only feed changes', async () => {
  const base = createUx1dRpc();
  const ranked = [UX1D_CONTENT.container, ...UX1D_CONTENT.feedPosts];
  const rpcPool = {
    getStatus: base.getStatus,
    async call(api, method, params) {
      if (api === 'bridge' && method === 'get_ranked_posts') {
        if (!params.start_author) return structuredClone(ranked);
        const index = ranked.findIndex((item) =>
          item.author === params.start_author && item.permlink === params.start_permlink);
        return structuredClone(index >= 0 ? ranked.slice(index) : ranked);
      }
      return base.call(api, method, params);
    },
  };
  const reads = new HiveReadService(rpcPool, { pageSize: 2 });
  const first = await reads.getCommunityPosts({
    name: 'hive-108590',
    sort: 'created',
    excludeContent: UX1D_CONTENT.container,
  });
  assert.deepEqual(first.items.map(({ permlink }) => permlink), [
    'opening-night-update',
    'patio-story-from-last-night',
  ]);
  assert.ok(first.nextCursor);

  const second = await reads.getCommunityPosts({
    name: 'hive-108590',
    sort: 'created',
    cursor: first.nextCursor,
    excludeContent: UX1D_CONTENT.container,
  });
  assert.deepEqual(second.items.map(({ permlink }) => permlink), [
    'jukebox-picks-for-friday',
    'legitimate-community-update',
  ]);
  assert.equal(second.nextCursor, null);
  assert.ok([...first.items, ...second.items].every(({ permlink }) => permlink !== UX1D_CONTENT.container.permlink));
});

test('Threads use one dense comment presentation context without exposing the active container', async () => {
  const fixture = hierarchyFixture();
  const response = await request(fixture.app)
    .get('/community/threads')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);

  assert.ok(document.querySelector('#thread-composer form[data-social-action="thread"]'));
  const comments = Array.from(document.querySelectorAll('.thread-feed > .social-comment--thread'));
  assert.equal(comments.length, 5);
  assert.deepEqual(comments.map((comment) => comment.dataset.commentDepth), ['1', '2', '3', '1', '1']);
  assert.equal(document.body.textContent.includes('Technical Threads Container — Do Not Display'), false);

  for (const comment of comments) {
    const vote = comment.querySelector(':scope > .social-comment__activity form[data-social-action="vote"]');
    const reply = comment.querySelector(':scope > details form[data-social-action="comment"]');
    assert.ok(vote);
    assert.ok(reply);
    assert.equal(hiddenValue(reply, 'parentAuthor'), hiddenValue(vote, 'author'));
    assert.equal(hiddenValue(reply, 'parentPermlink'), hiddenValue(vote, 'permlink'));
    assert.equal(comment.querySelector('.social-author__name').getAttribute('href'), `/profile/${hiddenValue(vote, 'author')}`);
  }
  assertUniqueIdsAndOwnedStatuses(document);
});

test('full conversation establishes root, composer, and depth-capped reply hierarchy without retargeting forms', async () => {
  const fixture = hierarchyFixture();
  const response = await request(fixture.app)
    .get('/post/etblink/opening-night-update')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);
  const root = document.querySelector('.conversation-post');
  assert.ok(root.querySelector('.conversation-post__header'));
  assert.ok(root.querySelector('.conversation-post__body'));
  assert.ok(root.querySelector('.conversation-post__activity'));

  const rootVote = root.querySelector('form[data-social-action="vote"]');
  assert.equal(hiddenValue(rootVote, 'author'), 'etblink');
  assert.equal(hiddenValue(rootVote, 'permlink'), 'opening-night-update');
  const rootReply = document.querySelector('#post-reply-composer form[data-social-action="comment"]');
  assert.equal(hiddenValue(rootReply, 'parentAuthor'), 'etblink');
  assert.equal(hiddenValue(rootReply, 'parentPermlink'), 'opening-night-update');

  const comments = Array.from(document.querySelectorAll('.conversation-thread > .social-comment--conversation'));
  assert.equal(comments.length, 4);
  assert.deepEqual(comments.map((comment) => comment.dataset.commentDepth), ['1', '2', '3', '1']);
  const expectedTargets = UX1D_CONTENT.rootReplies.map(({ author, permlink }) => `${author}/${permlink}`);
  assert.deepEqual(comments.map((comment) => {
    const vote = comment.querySelector(':scope > .social-comment__activity form[data-social-action="vote"]');
    const reply = comment.querySelector(':scope > details form[data-social-action="comment"]');
    assert.equal(hiddenValue(reply, 'parentAuthor'), hiddenValue(vote, 'author'));
    assert.equal(hiddenValue(reply, 'parentPermlink'), hiddenValue(vote, 'permlink'));
    return `${hiddenValue(vote, 'author')}/${hiddenValue(vote, 'permlink')}`;
  }), expectedTargets);
  assertUniqueIdsAndOwnedStatuses(document);
});

test('profile feed inherits the shared post hierarchy and policy activation stays byte-for-byte stable', async () => {
  const fixture = hierarchyFixture();
  const response = await request(fixture.app)
    .get('/profile/etblink')
    .set('cookie', fixture.cookie)
    .expect(200);
  const document = documentFor(response.text);
  assert.ok(document.querySelector('.profile-content-panel .social-post__content'));
  assert.ok(document.querySelector('.profile-content-panel .social-post__activity'));

  const threadSource = fs.readFileSync(
    path.join(ROOT, 'views/pages/community/partials/community-thread-list.ejs'),
    'utf8',
  );
  const conversationSource = fs.readFileSync(path.join(ROOT, 'views/partials/full-post.ejs'), 'utf8');
  const profileSource = fs.readFileSync(
    path.join(ROOT, 'views/pages/profile/partials/user-blog-posts.ejs'),
    'utf8',
  );
  assert.match(threadSource, /include\('\.\.\/\.\.\/\.\.\/common\/comment'.*commentContext: 'thread'/);
  assert.match(conversationSource, /include\('\.\.\/common\/comment'.*commentContext: 'conversation'/);
  assert.match(profileSource, /include\('\.\.\/\.\.\/\.\.\/common\/post'/);

  assert.deepEqual(BETA_ACTIONS, EXPECTED_BETA_ACTIONS);
  assert.equal(fixture.config.hive.writeMode, 'beta');
  assert.equal(fixture.app.locals.canWriteAction('vote'), true);
  assert.equal(fixture.app.locals.canWriteAction('thread'), true);
  assert.equal(fixture.app.locals.canWriteAction('profile'), false);
  assert.equal(fixture.config.hive.v1SelfSigningEnabled, false);
  assert.equal(V1_ACTIONS.length, 12);
  assert.equal(V1_ACTIONS.includes('profile'), true);
});
