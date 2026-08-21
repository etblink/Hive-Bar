'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { metadataRevision } = require('../src/hive/profile-settings');
const { BETA_M16_4_ACTIONS } = require('../routes/m4');
const { BETA_M16_3_ACTIONS } = require('../routes/social');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc, fixture } = require('./support/fixture-rpc');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';
const BARFRIEND_ACCOUNT = fixture.accounts.find((item) => item.name === 'barfriend');

function betaFixture({ account = 'barfriend', rpcPool = createFixtureRpc() } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create(account);
  const app = createApp({ config, logger, rpcPool, sessionStore });
  return { app, config, rpcPool, session, token };
}

function activeThreadRpc({ permlink = 'threads-2026-08-20' } = {}) {
  const baseRpc = createFixtureRpc();
  const calls = [];
  const container = {
    ...structuredClone(fixture.communityPosts[0]),
    author: 'fourthst.threads',
    permlink,
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: 'Technical Threads container',
  };
  return {
    calls,
    getStatus: baseRpc.getStatus,
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      if (
        `${api}.${method}` === 'bridge.get_account_posts' &&
        params.account === 'fourthst.threads'
      ) {
        return [structuredClone(container)];
      }
      return baseRpc.call(api, method, params);
    },
  };
}

function authorized(builder, fixtureApp) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .set('x-csrf-token', fixtureApp.session.csrfToken);
}

test('beta mode remains Keychain-only while social, profile, reward, and messaging lanes stay explicitly bounded', () => {
  assert.throws(
    () => configFrom({ HIVE_WRITE_MODE: 'beta' }),
    /Beta self-signing mode requires Hive Keychain/,
  );

  const config = configFrom({
    HIVE_WRITE_MODE: 'beta',
    HIVE_SIGNER_MODE: 'keychain',
  });
  assert.equal(config.hive.writeMode, 'beta');
  assert.equal(config.hive.betaSelfSigningEnabled, true);
  assert.deepEqual(config.hive.betaSelfActions, ['post', 'comment', 'thread']);
  assert.deepEqual([...BETA_M16_3_ACTIONS], [
    'vote',
    'follow',
    'unfollow',
    'subscribe',
    'unsubscribe',
  ]);
  assert.deepEqual([...BETA_M16_4_ACTIONS], ['profile', 'claim-rewards', 'wall', 'inbox']);
  assert.equal(config.hive.writesEnabled, false);
  assert.deepEqual(config.hive.controlledAccounts, []);
  assert.equal(config.payments.enabled, false);
});

test('an arbitrary verified beta user can prepare self-authored post and comment operations', async () => {
  const fixtureApp = betaFixture();

  const post = await authorized(
    request(fixtureApp.app).post('/api/social/preflight/post'),
    fixtureApp,
  )
    .send({
      title: 'Beta self-signing post',
      body: 'Prepared by the verified session account.',
      tags: ['reno'],
      author: 'etblink',
    })
    .expect(201);

  assert.equal(post.body.broadcastMode, 'beta-self');
  assert.equal(post.body.account, 'barfriend');
  assert.equal(post.body.signer, 'barfriend');
  assert.equal(post.body.authority, 'Posting');
  assert.equal(post.body.operations[0][0], 'comment');
  assert.equal(post.body.operations[0][1].author, 'barfriend');
  assert.equal(post.body.operations[0][1].parent_author, '');
  assert.equal(post.body.operations[0][1].parent_permlink, 'hive-108590');

  const comment = await authorized(
    request(fixtureApp.app).post('/api/social/preflight/comment'),
    fixtureApp,
  )
    .send({
      body: 'Replying as the verified beta account.',
      parentAuthor: 'etblink',
      parentPermlink: 'welcome-fourth-street-bar',
      author: 'etblink',
    })
    .expect(201);

  assert.equal(comment.body.broadcastMode, 'beta-self');
  assert.equal(comment.body.account, 'barfriend');
  assert.equal(comment.body.signer, 'barfriend');
  assert.equal(comment.body.operations[0][1].author, 'barfriend');
  assert.equal(comment.body.operations[0][1].parent_author, 'etblink');
  assert.equal(comment.body.operations[0][1].parent_permlink, 'welcome-fourth-street-bar');
});

test('M16.3 prepares explicit weighted upvotes and downvotes as the verified beta voter', async () => {
  const fixtureApp = betaFixture();

  const upvote = await authorized(
    request(fixtureApp.app).post('/api/social/preflight/vote'),
    fixtureApp,
  )
    .send({
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      voter: 'attacker',
      direction: 'upvote',
      percent: 42,
    })
    .expect(201);

  assert.equal(upvote.body.broadcastMode, 'beta-self');
  assert.equal(upvote.body.account, 'barfriend');
  assert.equal(upvote.body.signer, 'barfriend');
  assert.equal(upvote.body.authority, 'Posting');
  assert.deepEqual(upvote.body.operations, [
    ['vote', {
      voter: 'barfriend',
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      weight: 4200,
    }],
  ]);
  assert.equal(upvote.body.summary.kind, 'Upvote');
  assert.equal(upvote.body.summary.direction, 'upvote');
  assert.equal(upvote.body.summary.percent, 42);
  assert.equal(upvote.body.summary.weight, 4200);

  await authorized(
    request(fixtureApp.app).post(`/api/social/preflight/${upvote.body.id}/cancel`),
    fixtureApp,
  ).expect(204);

  const downvote = await authorized(
    request(fixtureApp.app).post('/api/social/preflight/vote'),
    fixtureApp,
  )
    .send({
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      direction: 'downvote',
      percent: 37,
    })
    .expect(201);

  assert.deepEqual(downvote.body.operations, [
    ['vote', {
      voter: 'barfriend',
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      weight: -3700,
    }],
  ]);
  assert.equal(downvote.body.summary.kind, 'Downvote');
  assert.equal(downvote.body.summary.direction, 'downvote');
  assert.equal(downvote.body.summary.percent, 37);
  assert.equal(downvote.body.summary.weight, -3700);

  await authorized(
    request(fixtureApp.app).post(`/api/social/preflight/${downvote.body.id}/cancel`),
    fixtureApp,
  ).expect(204);

  await authorized(
    request(fixtureApp.app).post('/api/social/preflight/vote'),
    fixtureApp,
  )
    .send({
      author: 'etblink',
      permlink: 'welcome-fourth-street-bar',
      direction: 'sideways',
      percent: 50,
    })
    .expect(400)
    .expect(({ body }) => assert.equal(body.error.code, 'VALIDATION_ERROR'));
});

test('M20.2 prepares follow and community membership actions as the verified beta account', async () => {
  const fixtureApp = betaFixture();
  const cases = [
    ['follow', { following: 'etblink', follower: 'attacker' }],
    ['unfollow', { following: 'etblink', follower: 'attacker' }],
    ['subscribe', { account: 'attacker' }],
    ['unsubscribe', { account: 'attacker' }],
  ];

  for (const [action, payload] of cases) {
    const response = await authorized(
      request(fixtureApp.app).post(`/api/social/preflight/${action}`),
      fixtureApp,
    )
      .send(payload)
      .expect(201);

    assert.equal(response.body.action, action);
    assert.equal(response.body.account, 'barfriend');
    assert.equal(response.body.signer, 'barfriend');
    assert.equal(response.body.authority, 'Posting');
    assert.equal(response.body.broadcastMode, 'beta-self');
    assert.doesNotMatch(JSON.stringify(response.body.operations), /attacker/);
  }
});

test('UX-1A prepares a reviewed Thread against the active container as the local Keychain signer', async () => {
  const rpcPool = activeThreadRpc();
  const fixtureApp = betaFixture({ rpcPool });
  const payload = {
    body: 'Starting a short beta conversation.',
    permlink: 'ux-1a-thread-fixture',
    author: 'attacker',
  };
  const prepared = await authorized(
    request(fixtureApp.app).post('/api/social/preflight/thread'),
    fixtureApp,
  )
    .send(payload)
    .expect(201);

  assert.equal(prepared.body.action, 'thread');
  assert.equal(prepared.body.broadcastMode, 'beta-self');
  assert.equal(prepared.body.account, 'barfriend');
  assert.equal(prepared.body.signer, 'barfriend');
  assert.equal(prepared.body.authority, 'Posting');
  assert.deepEqual(prepared.body.operations, [[
    'comment',
    {
      parent_author: 'fourthst.threads',
      parent_permlink: 'threads-2026-08-20',
      author: 'barfriend',
      permlink: 'ux-1a-thread-fixture',
      title: '',
      body: 'Starting a short beta conversation.',
      json_metadata:
        '{"tags":["hive-108590","threads"],"app":"fourth-street-bar-app/0.1.0","format":"markdown"}',
    },
  ]]);
  assert.deepEqual(prepared.body.summary, {
    kind: 'Thread',
    author: 'barfriend',
    parentAuthor: 'fourthst.threads',
    parentPermlink: 'threads-2026-08-20',
    permlink: 'ux-1a-thread-fixture',
    bodyBytes: 35,
  });
  assert.equal(
    rpcPool.calls.filter(({ method }) => method === 'get_account_posts').length,
    1,
  );
  assert.equal(
    rpcPool.calls.some(({ method }) => method === 'get_discussion'),
    false,
  );

  await authorized(
    request(fixtureApp.app).post('/api/social/preflight/thread'),
    fixtureApp,
  )
    .send(payload)
    .expect(409)
    .expect(({ body }) => assert.equal(body.error.code, 'DUPLICATE_OPERATION'));

  await authorized(
    request(fixtureApp.app).post(`/api/social/preflight/${prepared.body.id}/cancel`),
    fixtureApp,
  ).expect(204);
});

test('UX-1A Thread preparation validates content and fails safely when the container is absent or malformed', async () => {
  const missing = betaFixture();
  await authorized(
    request(missing.app).post('/api/social/preflight/thread'),
    missing,
  )
    .send({ body: 'No container means no preparation.' })
    .expect(503)
    .expect(({ body }) => assert.match(body.error.message, /Threads aren’t available yet/));

  const valid = betaFixture({ rpcPool: activeThreadRpc() });
  for (const body of ['', 'x'.repeat(501)]) {
    await authorized(
      request(valid.app).post('/api/social/preflight/thread'),
      valid,
    )
      .send({ body })
      .expect(400)
      .expect(({ body: responseBody }) => {
        assert.equal(responseBody.error.code, 'VALIDATION_ERROR');
      });
  }

  const malformed = betaFixture({ rpcPool: activeThreadRpc({ permlink: 'not valid!' }) });
  await authorized(
    request(malformed.app).post('/api/social/preflight/thread'),
    malformed,
  )
    .send({ body: 'Malformed containers fail closed.' })
    .expect(400)
    .expect(({ body }) => assert.equal(body.error.code, 'VALIDATION_ERROR'));

  await authorized(
    request(valid.app).post('/api/social/preflight/profile'),
    valid,
  )
    .send({})
    .expect(503)
    .expect(({ body }) => assert.equal(body.error.code, 'BETA_ACTION_NOT_ALLOWED'));
});

test('M16.4 messaging, profile settings, and rewards stay session-bound in beta', async () => {
  const fixtureApp = betaFixture();

  const wall = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/wall'),
    fixtureApp,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      message: 'Welcome to the neighborhood.',
      from: 'attacker',
    })
    .expect(201);

  assert.equal(wall.body.broadcastMode, 'beta-self');
  assert.equal(wall.body.account, 'barfriend');
  assert.equal(wall.body.authority, 'Active');
  assert.deepEqual(wall.body.operations, [[
    'transfer',
    {
      from: 'barfriend',
      to: 'etblink',
      amount: '1.000 HBD',
      memo: 'hivebar-wall:v1:Welcome to the neighborhood.',
    },
  ]]);

  await authorized(
    request(fixtureApp.app).post(`/api/m4/preflight/${wall.body.id}/accepted`),
    fixtureApp,
  )
    .send({ transactionId: '1'.repeat(40) })
    .expect(200);

  const observed = await authorized(
    request(fixtureApp.app).post(`/api/m4/preflight/${wall.body.id}/observe`),
    fixtureApp,
  ).expect(200);
  assert.equal(observed.body.state, 'observed');
  assert.equal(observed.body.blockNumber, 108944500);

  const inbox = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/inbox'),
    fixtureApp,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      ciphertext: '#8fixtureciphertext',
      from: 'attacker',
    })
    .expect(201);

  assert.equal(inbox.body.broadcastMode, 'beta-self');
  assert.equal(inbox.body.account, 'barfriend');
  assert.equal(inbox.body.authority, 'Active');
  assert.deepEqual(inbox.body.operations, [[
    'transfer',
    {
      from: 'barfriend',
      to: 'etblink',
      amount: '1.000 HBD',
      memo: 'hivebar-inbox:v1:#8fixtureciphertext',
    },
  ]]);
  assert.doesNotMatch(JSON.stringify(inbox.body.summary), /#8fixtureciphertext/);

  await authorized(
    request(fixtureApp.app).post(`/api/m4/preflight/${inbox.body.id}/cancel`),
    fixtureApp,
  ).expect(204);

  const staleFee = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/wall'),
    fixtureApp,
  )
    .send({
      recipient: 'etblink',
      expectedFee: '2.000 HBD',
      amount: '2.000 HBD',
      message: 'Stale fee must not pass.',
    })
    .expect(409);
  assert.equal(staleFee.body.error.code, 'WALL_FEE_CHANGED');

  const profile = await authorized(
    request(fixtureApp.app).post('/api/m4/preflight/profile'),
    fixtureApp,
  )
    .send({
      baseRevision: metadataRevision(BARFRIEND_ACCOUNT.posting_json_metadata),
      displayName: 'Bar Friend C2-A',
      about: 'C2-A beta profile rehearsal.',
      profileImage: 'https://images.hive.blog/u/barfriend/avatar',
      wallFee: '1.000 HBD',
      blocklist: '',
    })
    .expect(201);
  assert.equal(profile.body.broadcastMode, 'beta-self');
  assert.equal(profile.body.account, 'barfriend');
  assert.equal(profile.body.authority, 'Posting');
  assert.equal(profile.body.operations[0][0], 'account_update2');
  assert.equal(profile.body.operations[0][1].account, 'barfriend');

  const rewardFixture = betaFixture({ account: 'etblink' });
  const claim = await authorized(
    request(rewardFixture.app).post('/api/m4/preflight/claim-rewards'),
    rewardFixture,
  )
    .send({})
    .expect(201);

  assert.equal(claim.body.broadcastMode, 'beta-self');
  assert.equal(claim.body.account, 'etblink');
  assert.equal(claim.body.authority, 'Posting');
  assert.equal(claim.body.operations[0][0], 'claim_reward_balance');
  assert.equal(claim.body.operations[0][1].account, 'etblink');
});

test('beta UI exposes posts, community membership, focused voting, messaging, profile settings, and reward claims in plain language', async () => {
  const fixtureApp = betaFixture({ account: 'etblink' });

  const community = await request(fixtureApp.app)
    .get('/community')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  assert.match(community.text, /data-social-action="post" data-signer-mode="keychain"/);
  assert.match(community.text, /data-social-action="vote"\s+data-signer-mode="keychain"/);
  assert.match(community.text, /data-vote-open="upvote"/);
  assert.match(community.text, /data-vote-open="downvote"/);
  assert.match(community.text, /data-vote-dialog/);
  assert.match(community.text, /type="range"\s+name="percent"\s+value="100"/);
  assert.match(community.text, /data-social-action="(?:subscribe|unsubscribe)"/);

  const post = await request(fixtureApp.app)
    .get('/post/etblink/welcome-fourth-street-bar')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  const replyForms = post.text.match(/data-social-action="comment" data-signer-mode="keychain"/g) || [];
  assert.equal(replyForms.length, 2);
  assert.match(post.text, /Reply to @barfriend/);
  assert.match(post.text, /name="parentAuthor" value="barfriend"/);
  assert.match(post.text, /name="parentPermlink" value="re-welcome-fourth-street-bar"/);
  const voteForms = post.text.match(/data-social-action="vote"\s+data-signer-mode="keychain"/g) || [];
  assert.equal(voteForms.length, 2);
  assert.match(post.text, /Set the strength, then review the exact vote before Keychain opens/);

  const messenger = betaFixture({ account: 'barfriend' });
  const wall = await request(messenger.app)
    .get('/profile/etblink/wall-posts')
    .set('cookie', `hive_bar_session=${messenger.token}`)
    .expect(200);
  assert.match(wall.text, /data-m4-action="wall"/);
  assert.match(wall.text, /data-m4-action="inbox"/);
  assert.match(wall.text, /Keychain encrypts the message in this browser/);
  assert.match(wall.text, /review the recipient, message, fee, and payment before Keychain asks for approval/i);
  assert.doesNotMatch(wall.text, /exact Active operation|controlled-write run|Verified-owner page/);

  const settings = await request(fixtureApp.app)
    .get('/profile/etblink/settings')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  assert.match(settings.text, /data-m4-action="profile"/);
  assert.match(settings.text, />Review changes</);

  const wallet = await request(fixtureApp.app)
    .get('/profile/etblink/wallet')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  assert.match(wallet.text, /data-m4-action="claim-rewards"/);
  assert.match(wallet.text, /checks your current rewards again/i);
});
