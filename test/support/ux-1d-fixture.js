'use strict';

const path = require('node:path');
const express = require('express');
const { createApp } = require('../../src/app');
const { SessionStore } = require('../../src/auth/session-store');
const { createStaticAssetUrl } = require('../../src/release/static-assets');
const { configFrom, logger } = require('./test-app');
const { createFixtureRpc, fixture } = require('./fixture-rpc');

const ROOT = path.join(__dirname, '..', '..');
const ACCOUNT = 'etblink';

function content(overrides) {
  return {
    ...structuredClone(fixture.communityPosts[0]),
    active_votes: [],
    children: 0,
    pending_payout_value: '0.000 HBD',
    total_payout_value: '0.000 HBD',
    curator_payout_value: '0.000 HBD',
    ...overrides,
  };
}

const container = content({
  author: 'fourthst.threads',
  permlink: 'threads-2026-08-20',
  parent_author: '',
  parent_permlink: 'hive-108590',
  title: 'Technical Threads Container — Do Not Display',
  body: 'Application plumbing for Threads.',
  created: '2026-08-20T17:00:00',
});

const rootPost = content({
  author: 'etblink',
  permlink: 'opening-night-update',
  parent_author: '',
  parent_permlink: 'hive-108590',
  title: 'Tonight at 4th Street Bar',
  body: 'The patio lights are on and the first round is pouring. **Pull up a stool and tell us what you are listening to tonight.**\n\nWe will keep this thread updated as friends arrive.',
  created: '2026-08-20T18:30:00',
  children: 4,
  pending_payout_value: '2.375 HBD',
  active_votes: [
    { voter: 'barfriend', rshares: '1200' },
    { voter: 'renolocal', rshares: '900' },
  ],
});

const feedPosts = Object.freeze([
  rootPost,
  content({
    author: 'barfriend',
    permlink: 'patio-story-from-last-night',
    title: 'A patio story from last night',
    body: 'A regular brought in an old Reno postcard and everyone at the table had a story about the block.',
    created: '2026-08-20T18:10:00',
    children: 2,
    pending_payout_value: '0.750 HBD',
    active_votes: [{ voter: 'etblink', rshares: '1000' }],
  }),
  content({
    author: 'renolocal',
    permlink: 'jukebox-picks-for-friday',
    title: 'What belongs on Friday’s jukebox queue?',
    body: 'Share one song that belongs in the room this weekend. Deep cuts and familiar favorites are both welcome.',
    created: '2026-08-20T17:45:00',
    children: 5,
    active_votes: [
      { voter: 'etblink', rshares: '800' },
      { voter: 'barfriend', rshares: '600' },
    ],
  }),
  content({
    author: 'fourthst.threads',
    permlink: 'legitimate-community-update',
    title: 'Community update: patio hours',
    body: 'The patio will stay open later this Friday. This is a normal update, not the technical Threads container.',
    created: '2026-08-20T17:20:00',
    children: 1,
    active_votes: [{ voter: 'nightowl', rshares: '500' }],
  }),
]);

const rootReplies = Object.freeze([
  content({
    author: 'barfriend',
    permlink: 're-opening-night-update',
    parent_author: rootPost.author,
    parent_permlink: rootPost.permlink,
    title: '',
    body: 'I am bringing two friends after work. Save us a spot near the patio door.',
    created: '2026-08-20T19:00:00',
    children: 1,
    pending_payout_value: '0.125 HBD',
    active_votes: [{ voter: 'etblink', rshares: '700' }],
  }),
  content({
    author: 'renolocal',
    permlink: 're-barfriend-opening-night',
    parent_author: 'barfriend',
    parent_permlink: 're-opening-night-update',
    title: '',
    body: 'I will grab the corner table if I get there first.',
    created: '2026-08-20T19:05:00',
    children: 1,
    active_votes: [{ voter: 'barfriend', rshares: '450' }],
  }),
  content({
    author: 'etblink',
    permlink: 're-renolocal-opening-night',
    parent_author: 'renolocal',
    parent_permlink: 're-barfriend-opening-night',
    title: '',
    body: 'Perfect. I will let the bartender know you are on the way.',
    created: '2026-08-20T19:10:00',
    active_votes: [{ voter: 'barfriend', rshares: '350' }],
  }),
  content({
    author: 'nightowl',
    permlink: 'another-opening-night-reply',
    parent_author: rootPost.author,
    parent_permlink: rootPost.permlink,
    title: '',
    body: 'I vote for something loud on the jukebox after ten.',
    created: '2026-08-20T19:20:00',
    active_votes: [],
  }),
]);

const threads = Object.freeze([
  content({
    author: 'barfriend',
    permlink: 'who-is-stopping-by',
    parent_author: container.author,
    parent_permlink: container.permlink,
    title: '',
    body: 'Who is stopping by the bar tonight?',
    created: '2026-08-20T17:05:00',
    children: 1,
    active_votes: [{ voter: 'etblink', rshares: '700' }],
  }),
  content({
    author: 'renolocal',
    permlink: 're-who-is-stopping-by',
    parent_author: 'barfriend',
    parent_permlink: 'who-is-stopping-by',
    title: '',
    body: 'I will be there after work.',
    created: '2026-08-20T17:08:00',
    children: 1,
    active_votes: [{ voter: 'barfriend', rshares: '300' }],
  }),
  content({
    author: 'etblink',
    permlink: 're-renolocal-stopping-by',
    parent_author: 'renolocal',
    parent_permlink: 're-who-is-stopping-by',
    title: '',
    body: 'See you then — the patio should be comfortable by sunset.',
    created: '2026-08-20T17:10:00',
    active_votes: [],
  }),
  content({
    author: 'nightowl',
    permlink: 'jukebox-question',
    parent_author: container.author,
    parent_permlink: container.permlink,
    title: '',
    body: 'Quick question: what is the first jukebox pick tonight?',
    created: '2026-08-20T17:15:00',
    active_votes: [{ voter: 'barfriend', rshares: '250' }],
  }),
  content({
    author: 'fourthstreetbar',
    permlink: 'patio-is-open',
    parent_author: container.author,
    parent_permlink: container.permlink,
    title: '',
    body: 'Patio is open. Come say hello.',
    created: '2026-08-20T17:18:00',
    active_votes: [{ voter: 'etblink', rshares: '900' }],
  }),
]);

const extraProfiles = Object.freeze([
  {
    name: 'barfriend',
    metadata: { profile: { name: 'Bar Friend' } },
    stats: { followers: 3, following: 4 },
  },
  {
    name: 'fourthst.threads',
    metadata: { profile: { name: '4th Street Threads' } },
    stats: {},
  },
  {
    name: 'renolocal',
    metadata: { profile: { name: 'Reno Local' } },
    stats: { followers: 12, following: 8 },
  },
  {
    name: 'nightowl',
    metadata: { profile: { name: 'Night Owl' } },
    stats: { followers: 7, following: 6 },
  },
  {
    name: 'fourthstreetbar',
    metadata: { profile: { name: '4th Street Bar Reno' } },
    stats: { followers: 19, following: 4 },
  },
]);

function createUx1dRpc() {
  const baseRpc = createFixtureRpc();
  const calls = [];
  const profiles = [
    ...fixture.profiles.filter((profile) => profile.name !== 'barfriend'),
    ...extraProfiles,
  ];
  const rootDiscussion = Object.fromEntries(
    [rootPost, ...rootReplies].map((item) => [`${item.author}/${item.permlink}`, item]),
  );
  const threadDiscussion = Object.fromEntries(
    [container, ...threads].map((item) => [`${item.author}/${item.permlink}`, item]),
  );

  return {
    calls,
    getStatus: baseRpc.getStatus,
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      const key = `${api}.${method}`;
      if (key === 'bridge.get_ranked_posts') {
        return structuredClone([container, ...feedPosts]);
      }
      if (key === 'bridge.get_account_posts') {
        if (params.account === container.author) return [structuredClone(container)];
        return structuredClone(feedPosts.filter((post) => post.author === params.account));
      }
      if (key === 'bridge.get_discussion') {
        if (params.author === container.author && params.permlink === container.permlink) {
          return structuredClone(threadDiscussion);
        }
        if (params.author === rootPost.author && params.permlink === rootPost.permlink) {
          return structuredClone(rootDiscussion);
        }
      }
      if (key === 'bridge.get_post' && params.author === rootPost.author && params.permlink === rootPost.permlink) {
        return structuredClone(rootPost);
      }
      if (key === 'bridge.get_profiles') {
        return structuredClone(profiles.filter((profile) => params.accounts.includes(profile.name)));
      }
      if (key === 'bridge.get_profile') {
        return structuredClone(profiles.find((profile) => profile.name === params.account) || null);
      }
      return baseRpc.call(api, method, params);
    },
  };
}

function createUx1dVisualFixture() {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    RATE_LIMIT_MAX: '10000',
    SESSION_SECRET: 'ux-1d-visual-session-secret-that-is-at-least-32-bytes',
  });
  const rpcPool = createUx1dRpc();
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { token } = sessionStore.create(ACCOUNT);
  const application = createApp({ config, logger, rpcPool, sessionStore });
  application.locals.assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  const mutationAttempts = [];
  const app = express();
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    mutationAttempts.push({ method: req.method, path: req.originalUrl });
    return res.status(405).json({ error: { code: 'UX_1D_VISUAL_MUTATION_FORBIDDEN' } });
  });
  app.use(application);
  return { account: ACCOUNT, app, config, mutationAttempts, rpcPool, token };
}

module.exports = {
  UX1D_CONTENT: { container, feedPosts, rootPost, rootReplies, threads },
  createUx1dRpc,
  createUx1dVisualFixture,
};
