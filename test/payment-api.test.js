'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const hiveUri = require('hive-uri');
const { createApp } = require('../src/app');
const { SessionStore } = require('../src/auth/session-store');
const { configFrom, logger } = require('./support/test-app');
const { createFixtureRpc } = require('./support/fixture-rpc');

const ORIGIN = 'http://localhost:3000';
const SESSION_SECRET = 'test-session-secret-that-is-at-least-32-bytes';
const v4vBlankPayerInvoice = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'payments', 'v4v-hbd-blank-payer.txt'),
  'utf8',
).trim();

function invoice(memo = 'v4v-pos:tab-123') {
  return hiveUri.encodeOp([
    'transfer',
    {
      from: '__signer',
      to: 'fourthstreetbar',
      amount: '0.001 HBD',
      memo,
    },
  ], { signer: 'etblink', authority: 'active' });
}

function controlledApp({ configOverrides = {}, paymentObserver, now } = {}) {
  const config = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
    ...configOverrides,
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create('etblink');
  const observer = paymentObserver || {
    async observe() {
      return {
        status: 'confirmed',
        blockNumber: 109000000,
        transactionIndex: 2,
        chainTimestamp: '2026-08-13T08:00:05',
        corroborations: 2,
      };
    },
  };
  return {
    app: createApp({
      config,
      logger,
      rpcPool: createFixtureRpc(),
      sessionStore,
      paymentObserver: observer,
      now,
    }),
    config,
    session,
    token,
  };
}

function authorized(builder, fixtureApp) {
  return builder
    .set('origin', ORIGIN)
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .set('x-csrf-token', fixtureApp.session.csrfToken);
}

test('preflights, reviews, records acceptance, and confirms one exact merchant payment', async () => {
  const fixtureApp = controlledApp({ configOverrides: { DISTRIATOR_ENABLED: 'true' } });
  const preflight = await authorized(
    request(fixtureApp.app).post('/api/payments/preflight'),
    fixtureApp,
  ).send({ uri: invoice() }).expect(201);

  assert.equal(preflight.body.state, 'Validated');
  assert.equal(preflight.body.paid, false);
  assert.equal(preflight.body.authority, 'Active');
  assert.deepEqual(preflight.body.operations, [[
    'transfer',
    {
      from: 'etblink',
      to: 'fourthstreetbar',
      amount: '0.001 HBD',
      memo: 'v4v-pos:tab-123',
    },
  ]]);
  assert.equal(preflight.body.rebate.available, false);

  await authorized(
    request(fixtureApp.app).post(`/api/payments/${preflight.body.id}/awaiting-signature`),
    fixtureApp,
  ).expect(200).expect(({ body }) => assert.equal(body.state, 'AwaitingSignature'));

  await authorized(
    request(fixtureApp.app).post(`/api/payments/${preflight.body.id}/accepted`),
    fixtureApp,
  ).send({ transactionId: 'a'.repeat(40) }).expect(200).expect(({ body }) => {
    assert.equal(body.state, 'BroadcastAccepted');
    assert.equal(body.paid, false);
    assert.match(body.message, /pending exact confirmation/);
  });

  const confirmed = await authorized(
    request(fixtureApp.app).post(`/api/payments/${preflight.body.id}/observe`),
    fixtureApp,
  ).expect(200);
  assert.equal(confirmed.body.state, 'ChainConfirmed');
  assert.equal(confirmed.body.paid, true);
  assert.equal(confirmed.body.blockNumber, 109000000);
  assert.equal(confirmed.body.rebate.available, true);
  assert.equal(confirmed.body.rebate.url, 'https://distriator.com/#/claim');

  const recent = await request(fixtureApp.app)
    .get('/api/payments/recent')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  assert.equal(recent.body.id, preflight.body.id);
  assert.equal(recent.body.state, 'ChainConfirmed');

  await authorized(
    request(fixtureApp.app).post('/api/payments/preflight'),
    fixtureApp,
  ).send({ uri: invoice() }).expect(409).expect(({ body }) => {
    assert.equal(body.error.code, 'DUPLICATE_PAYMENT');
  });
});

test('persists a current-format V4V blank-payer invoice only after verified-account binding', async () => {
  const fixtureApp = controlledApp();
  const preflight = await authorized(
    request(fixtureApp.app).post('/api/payments/preflight'),
    fixtureApp,
  ).send({ uri: v4vBlankPayerInvoice }).expect(201);

  assert.equal(preflight.body.state, 'Validated');
  assert.equal(preflight.body.account, 'etblink');
  assert.equal(preflight.body.amount, '0.100 HBD');
  assert.deepEqual(preflight.body.operations, [[
    'transfer',
    {
      from: 'etblink',
      to: 'fourthstreetbar',
      amount: '0.100 HBD',
      memo: 'v4v-captured-format',
    },
  ]]);
  assert.equal(
    preflight.body.fingerprint,
    'cdb61a94af3c79333086d3d605d19a326a2fb342b7d7ccd9f61e0375e21975d0',
  );
});

test('keeps ambiguous or uncorrelated broadcasts pending and times out without a retry path', async () => {
  let now = Date.parse('2026-08-13T08:00:00Z');
  let observerCalls = 0;
  const fixtureApp = controlledApp({
    configOverrides: { HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS: '1000' },
    now: () => now,
    paymentObserver: {
      async observe() {
        observerCalls += 1;
        return { status: 'pending', diagnostic: 'one node only', corroborations: 1 };
      },
    },
  });
  const preflight = await authorized(
    request(fixtureApp.app).post('/api/payments/preflight'),
    fixtureApp,
  ).send({ uri: invoice('v4v-pos:pending') }).expect(201);
  await authorized(
    request(fixtureApp.app).post(`/api/payments/${preflight.body.id}/awaiting-signature`),
    fixtureApp,
  ).expect(200);
  await authorized(
    request(fixtureApp.app).post(`/api/payments/${preflight.body.id}/accepted`),
    fixtureApp,
  ).send({ transactionId: null }).expect(200);
  now += 1001;
  const timedOut = await authorized(
    request(fixtureApp.app).post(`/api/payments/${preflight.body.id}/observe`),
    fixtureApp,
  ).expect(200);
  assert.equal(timedOut.body.state, 'ConfirmationTimeout');
  assert.equal(timedOut.body.paid, false);
  assert.equal(observerCalls, 0);
  assert.match(timedOut.body.message, /do not pay again/);
});

test('allows a same-account pending receipt to be safely rechecked after write mode is disabled', async () => {
  const original = controlledApp();
  const preflight = await authorized(
    request(original.app).post('/api/payments/preflight'),
    original,
  ).send({ uri: invoice('v4v-pos:recovery') }).expect(201);
  await authorized(
    request(original.app).post(`/api/payments/${preflight.body.id}/awaiting-signature`),
    original,
  ).expect(200);
  await authorized(
    request(original.app).post(`/api/payments/${preflight.body.id}/accepted`),
    original,
  ).send({ transactionId: 'b'.repeat(40) }).expect(200);

  const config = configFrom({
    HIVE_WRITE_MODE: 'disabled',
    SESSION_SECRET,
    RATE_LIMIT_MAX: '1000',
  });
  const sessionStore = new SessionStore({
    secret: config.auth.sessionSecret,
    ttlMs: config.auth.sessionTtlMs,
  });
  const { session, token } = sessionStore.create('etblink');
  const recovered = {
    app: createApp({
      config,
      logger,
      rpcPool: createFixtureRpc(),
      sessionStore,
      receiptStore: original.app.locals.services.receiptStore,
      paymentObserver: {
        async observe() {
          return {
            status: 'confirmed',
            blockNumber: 109000001,
            transactionIndex: 1,
            chainTimestamp: '2026-08-13T08:01:00',
          };
        },
      },
    }),
    session,
    token,
  };
  const result = await authorized(
    request(recovered.app).post(`/api/payments/${preflight.body.id}/observe`),
    recovered,
  ).expect(200);
  assert.equal(result.body.state, 'ChainConfirmed');
  assert.equal(result.body.paid, true);

  const page = await request(recovered.app)
    .get('/pay')
    .set('cookie', `hive_bar_session=${token}`)
    .expect(200);
  assert.match(page.text, /Payments aren’t available right now/);
  assert.match(page.text, /data-pay-receipt hidden/);
  assert.match(page.text, /src="\/js\/pay-tab\.js"/);
  assert.doesNotMatch(page.text, /src="\/vendor\/zxing/);
});

test('enforces session, origin, CSRF, controlled-account, and merchant boundaries', async () => {
  const fixtureApp = controlledApp();
  await request(fixtureApp.app)
    .post('/api/payments/preflight')
    .set('origin', ORIGIN)
    .send({ uri: invoice() })
    .expect(401)
    .expect(({ body }) => assert.equal(body.error.code, 'SESSION_REQUIRED'));
  await request(fixtureApp.app)
    .post('/api/payments/preflight')
    .set('origin', 'https://attacker.example')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .set('x-csrf-token', fixtureApp.session.csrfToken)
    .send({ uri: invoice() })
    .expect(403)
    .expect(({ body }) => assert.equal(body.error.code, 'ORIGIN_NOT_ALLOWED'));

  const disabled = controlledApp({ configOverrides: { HIVE_WRITE_MODE: 'disabled' } });
  await authorized(request(disabled.app).post('/api/payments/preflight'), disabled)
    .send({ uri: invoice() })
    .expect(503);
});

test('renders the configured Pay Tab and hides the claim link until eligibility is enabled', async () => {
  const fixtureApp = controlledApp();
  const page = await request(fixtureApp.app)
    .get('/pay')
    .set('cookie', `hive_bar_session=${fixtureApp.token}`)
    .expect(200);
  assert.match(page.text, /@fourthstreetbar/);
  assert.match(page.text, /1\.000 HBD/);
  assert.match(page.text, /Use the HBD payment QR provided by the bar; Lightning and LNURL invoices are not supported here/);
  assert.doesNotMatch(page.text, /data-distriator-claim/);

  const enabled = controlledApp({ configOverrides: { DISTRIATOR_ENABLED: 'true' } });
  const enabledPage = await request(enabled.app)
    .get('/pay')
    .set('cookie', `hive_bar_session=${enabled.token}`)
    .expect(200);
  assert.match(enabledPage.text, /href="https:\/\/distriator\.com\/#\/claim"/);
  assert.match(enabledPage.text, /target="_blank" rel="noopener noreferrer"/);
  assert.match(enabledPage.text, /data-pay-rebate hidden/);
});
