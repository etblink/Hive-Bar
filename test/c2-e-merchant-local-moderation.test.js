'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { SESSION_COOKIE_NAME } = require('../src/auth/session-store');
const { loadConfig } = require('../src/config');
const { HiveReadService, encodePageCursor } = require('../src/hive/read-service');
const { ModerationService } = require('../src/moderation/moderation-service');
const { ModerationStore } = require('../src/moderation/moderation-store');
const { createModerationPolicy, filterDiscussionBranches } = require('../src/moderation/policy');
const { createFixtureApp, configFrom } = require('./support/test-app');
const { fixture } = require('./support/fixture-rpc');
const { createC2eRpc } = require('./support/c2-e-fixture');

function rawPost(author, permlink, extra = {}) {
  return {
    author,
    permlink,
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: permlink,
    body: `Body for ${permlink}`,
    created: '2026-08-20T12:00:00',
    active_votes: [],
    ...extra,
  };
}

test('store keeps reversible current state and append-only transition history', () => {
  let id = 0;
  let now = Date.parse('2026-08-21T00:00:00Z');
  const store = new ModerationStore({
    random: () => `target-${++id}`,
    now: () => (now += 1000),
  });
  try {
    const first = store.hide({
      targetType: 'content', author: 'alice', permlink: 'post-one',
      operator: 'etblink', reason: 'Local test rule',
    });
    assert.equal(first.changed, true);
    assert.equal(store.hide({
      targetType: 'content', author: 'alice', permlink: 'post-one',
      operator: 'etblink', reason: 'duplicate',
    }).changed, false);
    assert.equal(store.history().length, 1);
    assert.equal(store.unhide({ targetId: first.target.id, operator: 'etblink' }).changed, true);
    assert.deepEqual(store.snapshot(), { accounts: [], content: [] });
    const again = store.hide({
      targetType: 'content', author: 'alice', permlink: 'post-one',
      operator: 'etblink', reason: 'Reapplied',
    });
    assert.equal(again.target.id, first.target.id);
    assert.equal(store.history().length, 3);
  } finally {
    store.close();
  }
});

test('branch suppression removes hidden parent descendants but preserves siblings', () => {
  const root = { author: 'alice', permlink: 'root', parentAuthor: '', parentPermlink: 'hive-108590' };
  const parent = { author: 'bob', permlink: 'reply-bob', parentAuthor: 'alice', parentPermlink: 'root' };
  const child = { author: 'carol', permlink: 'reply-carol', parentAuthor: 'bob', parentPermlink: 'reply-bob' };
  const sibling = { author: 'dave', permlink: 'reply-dave', parentAuthor: 'alice', parentPermlink: 'root' };
  const policy = createModerationPolicy({ accounts: ['bob'], content: [] });
  const filtered = filterDiscussionBranches({ post: root, comments: [parent, child, sibling] }, policy);
  assert.deepEqual(filtered.comments.map((item) => item.author), ['dave']);
});

test('filtered Community pagination fills visible slots and hydrates visible authors only', async () => {
  const batches = [
    [rawPost('spammer', 'spam-1'), rawPost('spammer', 'spam-2'), rawPost('visibleone', 'visible-1'), rawPost('spammer', 'spam-3'), rawPost('spammer', 'spam-4'), rawPost('spammer', 'spam-5')],
    [rawPost('spammer', 'spam-5'), rawPost('visibletwo', 'visible-2'), rawPost('visiblethree', 'visible-3')],
  ];
  const calls = [];
  const service = new HiveReadService({
    async call(_api, method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (method === 'get_ranked_posts') return batches.shift() || [];
      if (method === 'get_profiles') return params.accounts.map((name) => ({ name, metadata: {}, stats: {} }));
      throw new Error(`unexpected ${method}`);
    },
  }, { pageSize: 2 });
  const page = await service.getCommunityPosts({
    name: 'hive-108590',
    contentFilter: (item) => item.author !== 'spammer',
    scanPageLimit: 3,
  });
  assert.deepEqual(page.items.map((item) => item.author), ['visibleone', 'visibletwo']);
  assert.equal(page.nextCursor, encodePageCursor(page.items[1]));
  assert.deepEqual(calls.find((call) => call.method === 'get_profiles').params.accounts, ['visibleone', 'visibletwo']);
  assert.equal(calls.filter((call) => call.method === 'get_ranked_posts').length, 2);
});

test('discussion filtering occurs before profile hydration', async () => {
  const root = rawPost('alice', 'root');
  const hidden = rawPost('bob', 'hidden', { parent_author: 'alice', parent_permlink: 'root', created: '2026-08-20T12:01:00' });
  const sibling = rawPost('dave', 'visible', { parent_author: 'alice', parent_permlink: 'root', created: '2026-08-20T12:02:00' });
  const calls = [];
  const service = new HiveReadService({
    async call(_api, method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (method === 'get_discussion') return { 'alice/root': root, 'bob/hidden': hidden, 'dave/visible': sibling };
      if (method === 'get_profiles') return params.accounts.map((name) => ({ name, metadata: {}, stats: {} }));
      throw new Error(`unexpected ${method}`);
    },
  });
  const policy = createModerationPolicy({ accounts: ['bob'], content: [] });
  const result = await service.getPostWithComments('alice', 'root', {
    discussionFilter: (discussion) => filterDiscussionBranches(discussion, policy),
  });
  assert.deepEqual(result.comments.map((item) => item.author), ['dave']);
  assert.deepEqual(calls.find((call) => call.method === 'get_profiles').params.accounts, ['alice', 'dave']);
});

test('moderation config is independent from Hive write mode and requires durable non-test storage', () => {
  const enabled = configFrom({
    HIVE_WRITE_MODE: 'disabled',
    HIVE_MODERATION_ENABLED: 'true',
    HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink',
  });
  assert.equal(enabled.hive.writeMode, 'disabled');
  assert.equal(enabled.moderation.enabled, true);
  assert.deepEqual(enabled.moderation.operatorAccounts, ['etblink']);
  assert.throws(() => loadConfig({
    NODE_ENV: 'development',
    HIVE_WRITE_MODE: 'disabled',
    HIVE_MODERATION_ENABLED: 'true',
    HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink',
    HIVE_MODERATION_DB_PATH: ':memory:',
  }, { loadDotenv: false }), /durable database path/);
});

test('API derives operator from verified session and denies non-operators', async () => {
  const { app } = createFixtureApp({
    configOverrides: {
      HIVE_MODERATION_ENABLED: 'true',
      HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink',
      SESSION_SECRET: 'c2-e-moderation-api-session-secret-32-bytes',
    },
  });
  const operator = app.locals.services.sessionStore.create('etblink');
  const outsider = app.locals.services.sessionStore.create('fartman69');
  const origin = app.locals.config.auth.appOrigin;
  const hidden = await request(app)
    .post('/api/moderation/hide').set('Origin', origin)
    .set('Cookie', `${SESSION_COOKIE_NAME}=${operator.token}`)
    .set('x-csrf-token', operator.session.csrfToken)
    .send({ targetType: 'content', author: 'alice', permlink: 'post-one', reason: 'Fixture rule', operator: 'mallory' });
  assert.equal(hidden.status, 201);
  assert.equal(hidden.body.target.updatedBy, 'etblink');
  const denied = await request(app)
    .post('/api/moderation/hide').set('Origin', origin)
    .set('Cookie', `${SESSION_COOKIE_NAME}=${outsider.token}`)
    .set('x-csrf-token', outsider.session.csrfToken)
    .send({ targetType: 'account', author: 'alice' });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'MODERATION_OPERATOR_REQUIRED');
  const management = await request(app).get('/moderation').set('Cookie', `${SESSION_COOKIE_NAME}=${operator.token}`);
  assert.equal(management.status, 200);
  assert.match(management.text, /Fixture rule/);
});

test('full-page and HTMX Community feeds enforce the same seeded rules', async () => {
  const rpcPool = createC2eRpc();
  const { app } = createFixtureApp({ rpcPool, configOverrides: {
    HIVE_MODERATION_ENABLED: 'true', HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink',
  } });
  app.locals.services.moderation.hide({ targetType: 'account', author: 'spammer', operator: 'etblink', reason: 'Account rule' });
  app.locals.services.moderation.hide({ targetType: 'content', author: 'bob', permlink: 'hidden-exact-post', operator: 'etblink', reason: 'Exact rule' });
  for (const response of [
    await request(app).get('/community'),
    await request(app).get('/community/hive-108590/community-posts').set('HX-Request', 'true'),
  ]) {
    assert.equal(response.status, 200);
    assert.match(response.text, /Visible community conversation/);
    assert.doesNotMatch(response.text, /Hidden account post|Hidden exact post/);
  }
});

test('hidden Community root is 404 while profile and non-Community direct reads remain outside C2-E', async () => {
  const { app } = createFixtureApp({ configOverrides: {
    HIVE_MODERATION_ENABLED: 'true', HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink',
  } });
  const root = fixture.communityPosts[0];
  app.locals.services.moderation.hide({
    targetType: 'content', author: root.author, permlink: root.permlink,
    operator: 'etblink', reason: 'Hide root',
  });
  assert.equal((await request(app).get(`/post/${root.author}/${root.permlink}`)).status, 404);
  const profile = await request(app).get(`/profile/${root.author}`);
  assert.equal(profile.status, 200);
  assert.doesNotMatch(profile.text, /data-moderation-control/);

  const config = configFrom({ HIVE_MODERATION_ENABLED: 'true', HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink' });
  const nonCommunity = { post: { author: 'alice', permlink: 'profile-post', parentAuthor: '', parentPermlink: 'blog' }, comments: [], profiles: { alice: { name: 'alice' } } };
  const service = new ModerationService({
    config, store: null, unavailableCause: new Error('missing store'),
    hiveReads: { async getPostWithComments(_a, _p, { discussionFilter }) { return { ...discussionFilter(nonCommunity), profiles: nonCommunity.profiles }; } },
  });
  assert.deepEqual(await service.getPostWithComments('alice', 'profile-post'), nonCommunity);
});

test('enabled unavailable store fails closed on Community but leaves unrelated profile available', async () => {
  const { app } = createFixtureApp({ configOverrides: {
    HIVE_MODERATION_ENABLED: 'true',
    HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink',
    HIVE_MODERATION_DB_PATH: '/definitely-missing-c2-e/moderation.sqlite3',
  } });
  assert.equal(app.locals.services.moderationStore, null);
  const community = await request(app).get('/community');
  assert.equal(community.status, 503);
  assert.match(community.text, /Community moderation is temporarily unavailable/i);
  assert.equal((await request(app).get(`/profile/${fixture.profiles[0].name}`)).status, 200);
});

test('ModerationService never delegates enabled Community reads when policy store is unavailable', async () => {
  const service = new ModerationService({
    config: configFrom({ HIVE_MODERATION_ENABLED: 'true', HIVE_MODERATION_OPERATOR_ACCOUNTS: 'etblink' }),
    hiveReads: { async getCommunityPosts() { throw new Error('must not delegate'); } },
    unavailableCause: new Error('missing store'),
  });
  await assert.rejects(
    service.getCommunityPosts({ name: 'hive-108590' }),
    (error) => error.code === 'MODERATION_STORE_UNAVAILABLE' && error.statusCode === 503,
  );
});
