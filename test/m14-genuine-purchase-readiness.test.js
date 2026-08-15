'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SCHEMA,
  STATUS,
  buildFrozenRecord,
  sha256,
  stableStringify,
  verifyFrozenRecord,
} = require('../scripts/m14-freeze-genuine-purchase');
const { fingerprint } = require('../src/hive/social-operations');
const { loadConfig } = require('../src/config');
const { assertPrivexReadOnlyRelease } = require('../src/release/privex-readiness');
const { PAYMENT_DB_PATH } = require('../src/release/payment-storage');

const COMMIT = '1'.repeat(40);
const TREE = '2'.repeat(40);
const CREATED_AT = '2026-08-15T19:33:00.000Z';
const fixture = fs
  .readFileSync(path.join(__dirname, 'fixtures', 'payments', 'v4v-hbd-blank-payer.txt'), 'utf8')
  .trim();


function productionReadOnlySource(overrides = {}) {
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
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
    HIVE_RPC_NODES: 'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'disabled',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_CONTROLLED_ACTIONS: '',
    HIVE_SIGNER_MODE: 'disabled',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: PAYMENT_DB_PATH,
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
    APP_ORIGIN: 'https://fourthstreetbar.com',
    SESSION_SECRET: 'm14-4-durable-observation-test-secret-32-bytes',
    TRUST_PROXY: 'loopback',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rebound(record) {
  const copy = clone(record);
  delete copy.bindingSha256;
  copy.bindingSha256 = sha256(stableStringify(copy));
  return copy;
}

test('M14.4 freezes a current-format V4V HBD invoice without authorizing Keychain or broadcast', () => {
  const record = buildFrozenRecord({
    uri: fixture,
    payer: 'etblink',
    acceptedCommit: COMMIT,
    acceptedTree: TREE,
    createdAt: CREATED_AT,
  });

  assert.equal(record.schema, SCHEMA);
  assert.equal(record.status, STATUS);
  assert.equal(record.acceptedCommit, COMMIT);
  assert.equal(record.acceptedTree, TREE);
  assert.equal(record.payer, 'etblink');
  assert.equal(record.merchant, 'fourthstreetbar');
  assert.equal(record.amount, '0.100 HBD');
  assert.equal(record.memo, 'v4v-captured-format');
  assert.equal(record.authority, 'Active');
  assert.deepEqual(record.operations, [[
    'transfer',
    {
      from: 'etblink',
      to: 'fourthstreetbar',
      amount: '0.100 HBD',
      memo: 'v4v-captured-format',
    },
  ]]);
  assert.equal(record.operationFingerprint, fingerprint(record.operations));
  assert.match(record.operationFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(record.invoiceSha256, sha256(fixture));
  assert.match(record.bindingSha256, /^[0-9a-f]{64}$/);
  assert.equal(record.distriatorEnabled, false);
  assert.equal(record.keychainRequestAuthorized, false);
  assert.equal(record.broadcastAuthorized, false);
  assert.equal(record.retryAuthorized, false);

  const repeat = buildFrozenRecord({
    uri: fixture,
    payer: 'etblink',
    acceptedCommit: COMMIT,
    acceptedTree: TREE,
    createdAt: CREATED_AT,
  });
  assert.deepEqual(repeat, record);
});

test('M14.4 exact verification binds the accepted release and immutable transfer', () => {
  const record = buildFrozenRecord({
    uri: fixture,
    payer: 'etblink',
    acceptedCommit: COMMIT,
    acceptedTree: TREE,
    createdAt: CREATED_AT,
  });
  const summary = verifyFrozenRecord(record, { expectedCommit: COMMIT, expectedTree: TREE });
  assert.equal(summary.operationFingerprint, record.operationFingerprint);
  assert.equal(summary.bindingSha256, record.bindingSha256);
  assert.equal(summary.keychainRequestAuthorized, false);
});

test('M14.4 verification rejects release drift and any authorization escalation', () => {
  const record = buildFrozenRecord({
    uri: fixture,
    payer: 'etblink',
    acceptedCommit: COMMIT,
    acceptedTree: TREE,
    createdAt: CREATED_AT,
  });

  assert.throws(() => verifyFrozenRecord(record, { expectedCommit: '3'.repeat(40), expectedTree: TREE }), /commit does not match/);
  assert.throws(() => verifyFrozenRecord(record, { expectedCommit: COMMIT, expectedTree: '4'.repeat(40) }), /tree does not match/);

  for (const field of ['keychainRequestAuthorized', 'broadcastAuthorized', 'retryAuthorized']) {
    const tampered = rebound({ ...record, [field]: true });
    assert.throws(() => verifyFrozenRecord(tampered, { expectedCommit: COMMIT, expectedTree: TREE }), /must not authorize/);
  }

  const distriator = rebound({ ...record, distriatorEnabled: true });
  assert.throws(() => verifyFrozenRecord(distriator, { expectedCommit: COMMIT, expectedTree: TREE }), /Distriator must remain disabled/);
});

test('M14.4 verification rejects transfer, fingerprint, and binding tampering', () => {
  const record = buildFrozenRecord({
    uri: fixture,
    payer: 'etblink',
    acceptedCommit: COMMIT,
    acceptedTree: TREE,
    createdAt: CREATED_AT,
  });

  const summaryMismatch = rebound({ ...record, amount: '0.200 HBD' });
  assert.throws(() => verifyFrozenRecord(summaryMismatch, { expectedCommit: COMMIT, expectedTree: TREE }), /summary does not exactly match/);

  const badFingerprint = rebound({ ...record, operationFingerprint: '0'.repeat(64) });
  assert.throws(() => verifyFrozenRecord(badFingerprint, { expectedCommit: COMMIT, expectedTree: TREE }), /fingerprint does not match/);

  const badBinding = { ...record, bindingSha256: '0'.repeat(64) };
  assert.throws(() => verifyFrozenRecord(badBinding, { expectedCommit: COMMIT, expectedTree: TREE }), /bindingSha256 does not match/);

  const overCeiling = clone(record);
  overCeiling.amount = '1.001 HBD';
  overCeiling.operations[0][1].amount = '1.001 HBD';
  overCeiling.operationFingerprint = fingerprint(overCeiling.operations);
  const overCeilingRebound = rebound(overCeiling);
  assert.throws(() => verifyFrozenRecord(overCeilingRebound, { expectedCommit: COMMIT, expectedTree: TREE }), /no greater than 1\.000 HBD/);
});

test('M14.4 permits only the exact durable receipt path in a write-disabled Privex observation profile', () => {
  const source = productionReadOnlySource();
  const config = loadConfig(source, { loadDotenv: false });
  const summary = assertPrivexReadOnlyRelease(config, source);

  assert.equal(summary.profile, 'privex-public-read-only-durable-receipts');
  assert.equal(summary.writeMode, 'disabled');
  assert.equal(summary.paymentsEnabled, false);
  assert.equal(summary.distriatorEnabled, false);
  assert.equal(summary.receiptDatabase, PAYMENT_DB_PATH);
  assert.equal(summary.receiptObservation, true);

  for (const [overrides, expected] of [
    [{ HIVE_SIGNER_MODE: 'keychain' }, /HIVE_SIGNER_MODE must be disabled/],
    [{ HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'othermerchant' }, /must remain bound to @fourthstreetbar/],
    [{ HIVE_PAYMENT_MAX_HBD: '0.999 HBD' }, /must retain the 1\.000 HBD ceiling/],
    [{ HIVE_M10_OPERATOR_ARMED_UNTIL: '2099-01-01T00:00:00.000Z' }, /no M9\/M10\/M12 posting-control state/],
    [{ HIVE_PAYMENT_RECEIPT_DB_PATH: '/tmp/receipts.sqlite3' }, /must be :memory: or exactly/],
  ]) {
    const badSource = productionReadOnlySource(overrides);
    const badConfig = loadConfig(badSource, { loadDotenv: false });
    assert.throws(() => assertPrivexReadOnlyRelease(badConfig, badSource), expected);
  }
});

test('M14.4 Privex helpers retain bounded fail-closed activation and durable read-only restoration', () => {
  const enable = fs.readFileSync(path.join(__dirname, '..', 'ops', 'privex', 'bin', 'hive-bar-payment-window-enable'), 'utf8');
  const disable = fs.readFileSync(path.join(__dirname, '..', 'ops', 'privex', 'bin', 'hive-bar-payment-window-disable'), 'utf8');

  assert.match(enable, /window_minutes=15/);
  assert.match(enable, /systemd-run --quiet --unit="\$unit" --on-active="\$\{window_minutes\}m"/);
  assert.match(enable, /HIVE_WRITES=Not-performed/);
  assert.match(enable, /KEYCHAIN_REQUESTS=Not-performed/);
  assert.match(enable, /separate-exact-Keychain-authorization-required/);
  assert.match(enable, /systemctl stop "\$health_timer"/);
  assert.match(enable, /rollback_after_activation_failure/);
  assert.ok(enable.indexOf('systemd-run --quiet') < enable.indexOf('systemctl stop "$health_timer"'));
  assert.ok(enable.indexOf('systemctl stop "$health_timer"') < enable.indexOf('mv -Tf "$activation_tmp" "$active_env"'));

  assert.match(disable, /saved inert read-only environment no longer satisfies the exact Privex release gate/);
  assert.match(disable, /derived durable receipt-observation profile failed the exact Privex read-only gate/);
  assert.match(disable, /HIVE_PAYMENT_RECEIPT_DB_PATH \"\$payment_db\"/);
  assert.match(disable, /active production is not read-only and the exact read-only backup is missing; refusing to guess/);
  assert.match(disable, /systemctl start "\$health_timer"/);
  assert.match(disable, /M14_4_PAYMENT_WINDOW=DISABLED/);
  assert.match(disable, /durable-read-only-receipt-observation/);
  assert.match(disable, /HIVE_WRITES=Not-performed/);
  assert.match(disable, /KEYCHAIN_REQUESTS=Not-performed/);
});
