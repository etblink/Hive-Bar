'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const hiveUri = require('hive-uri');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { loadConfig } = require('../src/config');
const {
  PAYMENT_DB_PATH,
  assertPrivexControlledPayment,
  isSafePaymentDatabasePath,
} = require('../src/release/payment-readiness');
const { logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const ORIGIN = 'https://fourthstreetbar.com';
const SESSION_SECRET = 'm14-payment-test-secret-that-is-at-least-32-bytes';

function productionSource(overrides = {}) {
  return {
    NODE_ENV: 'production',
    PORT: '3000',
    BIND_HOST: '127.0.0.1',
    HIVE_BAR_HOST: 'fourthstreetbar.com',
    SITE_NAME: '4th Street Bar',
    BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
    BAR_PHONE: '(775) 324-7827',
    BAR_HOURS: 'Daily, 12:00 p.m.–2:00 a.m.',
    BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
    BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno',
    HIVE_COMMUNITY_ID: 'hive-108590',
    HIVE_OFFICIAL_BAR_ACCOUNT: 'fourthstreetbar',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
    HIVE_RPC_NODES: 'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    HIVE_CONTROLLED_ACTIONS: 'payment',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: PAYMENT_DB_PATH,
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
    APP_ORIGIN: ORIGIN,
    SESSION_SECRET,
    TRUST_PROXY: 'loopback',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

function configFrom(source) {
  return loadConfig(source, { loadDotenv: false });
}

function invoice() {
  return hiveUri.encodeOp([
    'transfer',
    { from: '__signer', to: 'fourthstreetbar', amount: '0.100 HBD', memo: 'm14-test' },
  ], { signer: 'etblink', authority: 'active' });
}

function authorized(builder, fixture) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixture.token}`)
    .set('x-csrf-token', fixture.session.csrfToken);
}

test('accepts only the exact M14 controlled payment release profile', () => {
  const source = productionSource();
  const summary = assertPrivexControlledPayment(configFrom(source), source);
  assert.deepEqual(summary, {
    profile: 'm14-controlled-payment',
    payer: 'etblink',
    merchant: 'fourthstreetbar',
    action: 'payment',
    authority: 'Active',
    signer: 'keychain',
    maxHbd: '1.000 HBD',
    receiptDatabase: PAYMENT_DB_PATH,
    irreversibleConfirmation: true,
    distriatorEnabled: false,
    rpcNodeCount: 3,
  });
  assert.equal(isSafePaymentDatabasePath(PAYMENT_DB_PATH), true);
});

test('rejects mixed posting/payment state, unsafe storage, extra actions, and Distriator', () => {
  const cases = [
    [{ HIVE_CONTROLLED_ACCOUNTS: 'etblink,otheruser' }, /exactly one verified payer/],
    [{ HIVE_CONTROLLED_ACTIONS: 'payment,post' }, /only the payment action/],
    [{ HIVE_SIGNER_MODE: 'disabled' }, /HIVE_SIGNER_MODE must be keychain/],
    [{ HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar,otherbar' }, /only payment merchant/],
    [{ HIVE_PAYMENT_MAX_HBD: '2.000 HBD' }, /exactly 1\.000 HBD/],
    [{ HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:' }, /receipts\.sqlite3/],
    [{ DISTRIATOR_ENABLED: 'true' }, /Distriator must remain disabled/],
    [{ HIVE_M9_PILOT_CONTROL_PATH: '/tmp/pilot' }, /M9\/M10 posting-control state/],
    [{ HIVE_M10_OPERATOR_ARMED_UNTIL: '2099-01-01T00:00:00Z' }, /M9\/M10 posting-control state/],
    [{ HIVE_M12_MERCHANT_AUTHOR: 'fourthstreetbar', HIVE_M12_AUTHORIZED_SIGNERS: 'etblink' }, /M12 delegated-posting state/],
  ];
  for (const [overrides, expected] of cases) {
    const source = productionSource(overrides);
    assert.throws(() => assertPrivexControlledPayment(configFrom(source), source), expected);
  }
});

test('payment preflight is independent of expired M10 and M12 Posting identity machinery', async () => {
  const source = productionSource({
    NODE_ENV: 'test',
    HIVE_M10_OPERATOR_ARMED_UNTIL: '2020-01-01T00:00:00Z',
    HIVE_M10_OPERATOR_AUDIT_PATH: '/tmp/m10-operator-audit.ndjson',
    HIVE_M12_MERCHANT_AUTHOR: 'fourthstreetbar',
    HIVE_M12_AUTHORIZED_SIGNERS: 'etblink',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
  });
  const config = configFrom(source);
  const sessionStore = new SessionStore({ secret: config.auth.sessionSecret, ttlMs: config.auth.sessionTtlMs });
  const { session, token } = sessionStore.create('etblink');
  const app = createApp({
    config,
    logger,
    rpcPool: createFixtureRpc(),
    sessionStore,
    authorityVerifier: {
      async isDirectAccountAuthorized() {
        throw new Error('payment must never inspect Posting delegation');
      },
    },
    paymentObserver: { async observe() { return { status: 'pending', diagnostic: 'not used' }; } },
  });
  const fixture = { app, session, token };
  const response = await authorized(request(app).post('/api/payments/preflight'), fixture)
    .send({ uri: invoice() })
    .expect(201);
  assert.equal(response.body.authority, 'Active');
  assert.equal(response.body.account, 'etblink');
});
