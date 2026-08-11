'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const request = require('supertest');
const { createApp } = require('../src/app');
const {
  ChallengeStore,
  SessionStore,
  sessionCookie,
} = require('../src/auth/session-store');
const { KeychainAuthService, verifyCompactSignature } = require('../src/auth/keychain-auth');
const { PostingAuthorityVerifier } = require('../src/hive/posting-authority');
const { configFrom, logger } = require('./support/test-app');

const APP_ORIGIN = 'http://localhost:3000';

async function signingKey(seed = 'hive-bar-m3-auth-vector') {
  const { PrivateKey } = await import('hive-tx');
  return PrivateKey.fromSeed(seed);
}

function signMessage(key, message) {
  const digest = createHash('sha256').update(message, 'utf8').digest();
  return key.sign(digest).customToString();
}

function authorityRpc(accounts) {
  const calls = [];
  return {
    calls,
    getStatus: () => [],
    async call(api, method, params) {
      calls.push({ api, method, params: structuredClone(params) });
      assert.equal(`${api}.${method}`, 'condenser_api.get_accounts');
      return params[0].map((name) => accounts[name]).filter(Boolean);
    },
  };
}

async function authenticatedFixture() {
  const key = await signingKey();
  const publicKey = key.createPublic().toString();
  const rpcPool = authorityRpc({
    etblink: {
      name: 'etblink',
      posting: { weight_threshold: 1, account_auths: [], key_auths: [[publicKey, 1]] },
    },
  });
  const config = configFrom({
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-bytes',
    RATE_LIMIT_MAX: '1000',
    AUTH_RATE_LIMIT_MAX: '100',
  });
  const app = createApp({ config, logger, rpcPool });
  return { app, key, publicKey, rpcPool };
}

test('creates a server-verified Keychain session and logs out with CSRF protection', async () => {
  const { app, key, publicKey, rpcPool } = await authenticatedFixture();
  const agent = request.agent(app);

  const issued = await agent
    .post('/auth/challenge')
    .set('origin', APP_ORIGIN)
    .send({ account: 'etblink' })
    .expect(201);
  assert.match(issued.body.message, /Account: @etblink/);
  assert.match(issued.body.message, /Origin: http:\/\/localhost:3000/);
  assert.match(issued.body.message, /no Hive transaction is authorized/);

  const verified = await agent
    .post('/auth/verify')
    .set('origin', APP_ORIGIN)
    .send({
      account: 'etblink',
      challengeId: issued.body.id,
      publicKey,
      signature: signMessage(key, issued.body.message),
    })
    .expect(201);

  assert.equal(verified.body.account, 'etblink');
  assert.match(verified.body.csrfToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(verified.headers['set-cookie'][0], /HttpOnly/);
  assert.match(verified.headers['set-cookie'][0], /SameSite=Strict/);
  assert.doesNotMatch(verified.headers['set-cookie'][0], /Secure/);
  assert.equal(rpcPool.calls.length, 1);

  const session = await agent.get('/auth/session').expect(200);
  assert.deepEqual(session.body, {
    authenticated: true,
    account: 'etblink',
    csrfToken: verified.body.csrfToken,
    issuedAt: verified.body.issuedAt,
    expiresAt: verified.body.expiresAt,
  });

  await agent
    .post('/auth/logout')
    .set('origin', APP_ORIGIN)
    .set('x-csrf-token', 'wrong-token')
    .expect(403)
    .expect(({ body }) => assert.equal(body.error.code, 'CSRF_INVALID'));

  await agent
    .post('/auth/logout')
    .set('origin', APP_ORIGIN)
    .set('x-csrf-token', verified.body.csrfToken)
    .expect(204)
    .expect('set-cookie', /Max-Age=0/);
  assert.deepEqual((await agent.get('/auth/session').expect(200)).body, { authenticated: false });
});

test('consumes every challenge exactly once, including failed verification attempts', async () => {
  const { app, key, publicKey } = await authenticatedFixture();
  const issued = await request(app)
    .post('/auth/challenge')
    .set('origin', APP_ORIGIN)
    .send({ account: 'etblink' })
    .expect(201);
  const payload = {
    account: 'etblink',
    challengeId: issued.body.id,
    publicKey,
    signature: signMessage(key, issued.body.message),
  };

  await request(app).post('/auth/verify').set('origin', APP_ORIGIN).send(payload).expect(201);
  const replay = await request(app)
    .post('/auth/verify')
    .set('origin', APP_ORIGIN)
    .send(payload)
    .expect(401);
  assert.equal(replay.body.error.code, 'AUTH_CHALLENGE_INVALID');

  const second = await request(app)
    .post('/auth/challenge')
    .set('origin', APP_ORIGIN)
    .send({ account: 'etblink' })
    .expect(201);
  const mismatch = await request(app)
    .post('/auth/verify')
    .set('origin', APP_ORIGIN)
    .send({ ...payload, challengeId: second.body.id, account: 'barfriend' })
    .expect(401);
  assert.equal(mismatch.body.error.code, 'AUTH_ACCOUNT_MISMATCH');
  const consumed = await request(app)
    .post('/auth/verify')
    .set('origin', APP_ORIGIN)
    .send({ ...payload, challengeId: second.body.id })
    .expect(401);
  assert.equal(consumed.body.error.code, 'AUTH_CHALLENGE_INVALID');
});

test('rejects expired challenges, invalid signatures, wrong authorities, and foreign origins distinctly', async () => {
  const key = await signingKey();
  const otherKey = await signingKey('other-posting-key');
  const publicKey = key.createPublic().toString();
  let now = Date.parse('2026-08-11T12:00:00Z');
  const challengeStore = new ChallengeStore({
    ttlMs: 30_000,
    origin: APP_ORIGIN,
    now: () => now,
  });
  const sessionStore = new SessionStore({
    secret: 'test-session-secret-that-is-at-least-32-bytes',
    ttlMs: 300_000,
    now: () => now,
  });
  const rpcPool = authorityRpc({
    etblink: {
      name: 'etblink',
      posting: {
        weight_threshold: 1,
        account_auths: [],
        key_auths: [[otherKey.createPublic().toString(), 1]],
      },
    },
  });
  const keychainAuth = new KeychainAuthService({
    challengeStore,
    sessionStore,
    authorityVerifier: new PostingAuthorityVerifier(rpcPool),
  });
  const config = configFrom({
    SESSION_SECRET: 'test-session-secret-that-is-at-least-32-bytes',
    AUTH_CHALLENGE_TTL_MS: '30000',
  });
  const app = createApp({
    config,
    logger,
    rpcPool,
    challengeStore,
    sessionStore,
    keychainAuth,
  });

  const foreign = await request(app)
    .post('/auth/challenge')
    .set('origin', 'https://attacker.example')
    .send({ account: 'etblink' })
    .expect(403);
  assert.equal(foreign.body.error.code, 'ORIGIN_NOT_ALLOWED');

  const expired = await request(app)
    .post('/auth/challenge')
    .set('origin', APP_ORIGIN)
    .send({ account: 'etblink' })
    .expect(201);
  now += 30_001;
  const expiredResult = await request(app)
    .post('/auth/verify')
    .set('origin', APP_ORIGIN)
    .send({
      account: 'etblink',
      challengeId: expired.body.id,
      publicKey,
      signature: signMessage(key, expired.body.message),
    })
    .expect(401);
  assert.equal(expiredResult.body.error.code, 'AUTH_CHALLENGE_EXPIRED');

  const invalid = challengeStore.issue('etblink');
  const invalidResult = await request(app)
    .post('/auth/verify')
    .set('origin', APP_ORIGIN)
    .send({
      account: 'etblink',
      challengeId: invalid.id,
      publicKey,
      signature: '00'.repeat(65),
    })
    .expect(401);
  assert.equal(invalidResult.body.error.code, 'AUTH_SIGNATURE_INVALID');

  const wrongAuthority = challengeStore.issue('etblink');
  const authorityResult = await request(app)
    .post('/auth/verify')
    .set('origin', APP_ORIGIN)
    .send({
      account: 'etblink',
      challengeId: wrongAuthority.id,
      publicKey,
      signature: signMessage(key, wrongAuthority.message),
    })
    .expect(401);
  assert.equal(authorityResult.body.error.code, 'AUTHORITY_MISMATCH');
});

test('verifies a compact Keychain signature without accepting malformed crypto material', async () => {
  const key = await signingKey();
  const publicKey = key.createPublic().toString();
  const message = 'server-owned challenge';
  assert.equal(
    await verifyCompactSignature({ message, publicKey, signature: signMessage(key, message) }),
    true,
  );
  await assert.rejects(
    verifyCompactSignature({ message, publicKey, signature: 'not-a-signature' }),
    (error) => error.code === 'AUTH_SIGNATURE_INVALID',
  );
  await assert.rejects(
    verifyCompactSignature({ message, publicKey: 'STM-not-a-key', signature: '00'.repeat(65) }),
    (error) => error.code === 'AUTH_PUBLIC_KEY_INVALID',
  );
});

test('honors recursive posting account authorities while bounding cycles', async () => {
  const key = await signingKey();
  const publicKey = key.createPublic().toString();
  const rpcPool = authorityRpc({
    parent: {
      name: 'parent',
      posting: { weight_threshold: 2, key_auths: [], account_auths: [['delegate', 2]] },
    },
    delegate: {
      name: 'delegate',
      posting: {
        weight_threshold: 1,
        key_auths: [[publicKey, 1]],
        account_auths: [['parent', 1]],
      },
    },
  });
  const verifier = new PostingAuthorityVerifier(rpcPool);
  assert.equal(await verifier.isAuthorized('parent', publicKey), true);
  assert.equal(await verifier.isAuthorized('parent', (await signingKey('unused')).createPublic().toString()), false);
});

test('expires and rejects tampered opaque sessions and marks production cookies Secure', () => {
  let now = 1_000;
  const store = new SessionStore({
    secret: 'test-session-secret-that-is-at-least-32-bytes',
    ttlMs: 300_000,
    now: () => now,
    random: (() => {
      let call = 0;
      return () => `random-token-${++call}`;
    })(),
  });
  const { session, token } = store.create('etblink');
  assert.equal(store.get(token), session);
  assert.equal(store.get(`${token}tampered`), null);
  now += 300_001;
  assert.equal(store.get(token), null);

  const cookie = sessionCookie('opaque.signed', {
    isProduction: true,
    auth: { sessionTtlMs: 300_000 },
  });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /etblink/);
});
