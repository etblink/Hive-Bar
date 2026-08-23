'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  MIN_ONBOARDING_REMAINING_HP,
  parseOnboardingConfig,
} = require('../src/onboarding/config');
const {
  ONBOARDING_SCHEMA_VERSION,
  OnboardingRequestStore,
  inspectOnboardingStore,
} = require('../src/onboarding/request-store');
const { OnboardingService } = require('../src/onboarding/service');
const { configFrom } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const KEYS = Object.freeze({
  owner: 'STM6pbYm2TgVWgzb3FsfwkZFLNEqCZ133eM5BDMQjEfGM1S6Uqus9',
  active: 'STM8mnuYALhWKgmEgg2ehxNEh62vKhKSg9gBUTctqSTiUXr1UKoMS',
  posting: 'STM67N3WrJNTjUxk2UDnDGKE7tjZbCysYesfHW382t4o6TyTnYrnT',
  memo: 'STM6Z5YnEj9n5LnPpfhg7P2oT36nzhxy982q4xPt3FxvEtkh3Ksjr',
});

function tempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-bar-c2-f-'));
  return { dir, filename: path.join(dir, 'onboarding.sqlite3') };
}

function config(overrides = {}) {
  return parseOnboardingConfig({
    HIVE_ONBOARDING_ENABLED: 'true', HIVE_ONBOARDING_CREATOR_ACCOUNT: 'etblink',
    HIVE_ONBOARDING_CASH_FEE_USD: '5.00', HIVE_ONBOARDING_STARTER_HP: '5.000',
    HIVE_ONBOARDING_MIN_REMAINING_HP: '10.000', HIVE_ONBOARDING_LOW_ACT_THRESHOLD: '3',
    HIVE_ONBOARDING_REQUEST_TTL_MS: '900000',
    HIVE_ONBOARDING_REQUEST_RATE_WINDOW_MS: '60000',
    HIVE_ONBOARDING_REQUEST_RATE_MAX: '5', HIVE_ONBOARDING_MAX_LIVE_REQUESTS: '25',
    HIVE_ONBOARDING_MAX_DAILY_REQUESTS: '50', ...overrides,
  }, configFrom({ HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain' }).hive);
}

function creatorRow(pending = 2, vestingShares = '100000.000000 VESTS') {
  return {
    name: 'etblink', pending_claimed_accounts: pending,
    vesting_shares: vestingShares, delegated_vesting_shares: '0.000000 VESTS',
    to_withdraw: '0', withdrawn: '0',
  };
}

function rpc({ created = false, pending = 2, vestingShares = '100000.000000 VESTS' } = {}) {
  return {
    async call(api, method, params) {
      if (`${api}.${method}` === 'condenser_api.get_accounts') {
        const rows = [];
        if (params[0].includes('etblink')) rows.push(creatorRow(pending, vestingShares));
        if (created && params[0].includes('newhiver')) rows.push({
          name: 'newhiver',
          owner: { weight_threshold: 1, account_auths: [], key_auths: [[KEYS.owner, 1]] },
          active: { weight_threshold: 1, account_auths: [], key_auths: [[KEYS.active, 1]] },
          posting: { weight_threshold: 1, account_auths: [], key_auths: [[KEYS.posting, 1]] },
          memo_key: KEYS.memo,
        });
        return rows;
      }
      if (`${api}.${method}` === 'condenser_api.get_dynamic_global_properties') {
        return { total_vesting_fund_hive: '1000.000 HIVE', total_vesting_shares: '2000000.000000 VESTS' };
      }
      if (`${api}.${method}` === 'condenser_api.get_vesting_delegations') {
        return created ? [{ delegator: 'etblink', delegatee: 'newhiver', vesting_shares: '10000.000000 VESTS' }] : [];
      }
      throw new Error(`Unexpected C2-F RPC ${api}.${method}`);
    },
  };
}

function createPayload(idempotencyKey = 'c2f_idempotency_key_000000000000001') {
  return {
    idempotencyKey, username: 'newhiver', publicKeys: KEYS, recoveryAcknowledged: true,
  };
}

test('C2-F persists request state across store restart with defensive schema v1', () => {
  const { dir, filename } = tempDb();
  let store = new OnboardingRequestStore({ filename, ttlMs: 900000 });
  const created = store.create({
    username: 'newhiver', publicKeys: KEYS,
    idempotencyKey: 'restart_idempotency_key_00000000000001', creator: 'etblink',
    starterHp: '5.000 HP', cashFeeUsd: '5.00',
  }).record;
  store.close();
  store = new OnboardingRequestStore({ filename, ttlMs: 900000, requireExisting: true });
  assert.equal(store.get(created.id).username, 'newhiver');
  assert.equal(store.schemaVersion(), ONBOARDING_SCHEMA_VERSION);
  store.close();
  assert.deepEqual(inspectOnboardingStore(filename), { schemaVersion: 1, integrity: 'ok' });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('C2-F production storage refuses missing, symlink, and unsupported targets', () => {
  const { dir, filename } = tempDb();
  assert.throws(() => new OnboardingRequestStore({ filename, requireExisting: true }), /must already exist/);
  const real = path.join(dir, 'real.sqlite3');
  fs.writeFileSync(real, '');
  const link = path.join(dir, 'link.sqlite3');
  try {
    fs.symlinkSync(real, link);
    assert.throws(() => new OnboardingRequestStore({ filename: link, requireExisting: true }), /unsafe/);
  } catch (error) {
    if (!['EPERM', 'EACCES'].includes(error?.code)) throw error;
  }
  const store = new OnboardingRequestStore({ filename: real, requireExisting: true });
  store.close();
  const db = new DatabaseSync(real);
  db.prepare("UPDATE hive_bar_schema SET version = 99 WHERE name = 'onboarding'").run();
  db.close();
  assert.throws(() => inspectOnboardingStore(real), /Unsupported/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('C2-F idempotency is durable and payload-bound', async () => {
  const store = new OnboardingRequestStore();
  const service = new OnboardingService({ rpcPool: rpc(), config: config(), store });
  const first = await service.createRequest(createPayload());
  const retry = await service.createRequest(createPayload());
  assert.equal(retry.reused, true);
  assert.equal(retry.request.id, first.request.id);
  await assert.rejects(
    service.createRequest({ ...createPayload(), username: 'differentname' }),
    /retry key|different request/i,
  );
  store.close();
});

test('C2-F enforces durable live and daily request ceilings', () => {
  const liveLimited = new OnboardingRequestStore({ maxLiveRequests: 1, maxDailyRequests: 2 });
  liveLimited.create({ username: 'firstuser', publicKeys: KEYS, idempotencyKey: 'limit_live_key_000000000000000000001', creator: 'etblink', starterHp: '5.000 HP', cashFeeUsd: '5.00' });
  assert.throws(() => liveLimited.create({ username: 'seconduser', publicKeys: KEYS, idempotencyKey: 'limit_live_key_000000000000000000002', creator: 'etblink', starterHp: '5.000 HP', cashFeeUsd: '5.00' }), /live-request limit/);
  liveLimited.close();

  const daily = new OnboardingRequestStore({ maxLiveRequests: 1, maxDailyRequests: 1 });
  const one = daily.create({ username: 'firstuser', publicKeys: KEYS, idempotencyKey: 'limit_daily_key_0000000000000000001', creator: 'etblink', starterHp: '5.000 HP', cashFeeUsd: '5.00' }).record;
  daily.cancel(one.id);
  assert.throws(() => daily.create({ username: 'seconduser', publicKeys: KEYS, idempotencyKey: 'limit_daily_key_0000000000000000002', creator: 'etblink', starterHp: '5.000 HP', cashFeeUsd: '5.00' }), /daily request limit/);
  daily.close();
});

test('C2-F allows one creator transaction lane and never expires it after Keychain begins', async () => {
  let now = 10_000;
  const store = new OnboardingRequestStore({ ttlMs: 300000, now: () => now });
  const service = new OnboardingService({ rpcPool: rpc(), config: config(), store, now: () => now });
  const first = await service.createRequest(createPayload('creator_lane_key_0000000000000000001'));
  await service.prepare(first.request.id, { staffAccount: 'etblink', cashConfirmed: true });
  const second = await service.createRequest({ ...createPayload('creator_lane_key_0000000000000000002'), username: 'seconduser' });
  await assert.rejects(service.prepare(second.request.id, { staffAccount: 'etblink', cashConfirmed: true }), /lane|another onboarding request/i);
  await service.beginBroadcast(first.request.id, { staffAccount: 'etblink' });
  now += 300001;
  assert.equal(store.get(first.request.id).status, 'signing');
  store.close();
});

test('C2-F revalidates creator resources at the one-time broadcast gate', async () => {
  let pending = 2;
  const dynamicRpc = rpc();
  const wrapped = { async call(api, method, params) {
    if (`${api}.${method}` === 'condenser_api.get_accounts' && params[0].includes('etblink')) {
      const rows = await dynamicRpc.call(api, method, params);
      return rows.map((row) => row.name === 'etblink' ? { ...row, pending_claimed_accounts: pending } : row);
    }
    return dynamicRpc.call(api, method, params);
  } };
  const service = new OnboardingService({ rpcPool: wrapped, config: config() });
  const created = await service.createRequest(createPayload('revalidate_key_0000000000000000000001'));
  await service.prepare(created.request.id, { staffAccount: 'etblink', cashConfirmed: true });
  pending = 0;
  await assert.rejects(service.beginBroadcast(created.request.id, { staffAccount: 'etblink' }), /account-creation token/);
  assert.equal((await service.staffStatus(created.request.id, 'etblink')).status, 'prepared');
});

test('C2-F definite cancellation is terminal while ambiguous broadcast remains observation-only', async () => {
  const service = new OnboardingService({ rpcPool: rpc(), config: config() });
  const cancelled = await service.createRequest(createPayload('cancelled_key_00000000000000000000001'));
  await service.prepare(cancelled.request.id, { staffAccount: 'etblink', cashConfirmed: true });
  await service.beginBroadcast(cancelled.request.id, { staffAccount: 'etblink' });
  assert.equal(service.recordBroadcast(cancelled.request.id, { staffAccount: 'etblink', cancelled: true }).status, 'cancelled');
  await assert.rejects(service.beginBroadcast(cancelled.request.id, { staffAccount: 'etblink' }));

  const ambiguous = await service.createRequest({ ...createPayload('ambiguous_key_0000000000000000000001'), username: 'otherhiver' });
  await service.prepare(ambiguous.request.id, { staffAccount: 'etblink', cashConfirmed: true });
  await service.beginBroadcast(ambiguous.request.id, { staffAccount: 'etblink' });
  assert.equal(service.recordBroadcast(ambiguous.request.id, { staffAccount: 'etblink', ambiguous: true }).status, 'observing');
  await assert.rejects(service.beginBroadcast(ambiguous.request.id, { staffAccount: 'etblink' }));
});

test('C2-F public records never disclose keys, retry capability, operations, or transaction diagnostics', async () => {
  const service = new OnboardingService({ rpcPool: rpc(), config: config() });
  const created = await service.createRequest(createPayload('public_redaction_key_00000000000000001'));
  const serialized = JSON.stringify(created.request);
  for (const forbidden of ['STM6pb', 'idempotency', 'operations', 'transaction', 'fingerprint', 'publicKeys']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('C2-F.1 makes merchant policy configurable while enforcing the Hive-Bar reserve floor', () => {
  const merchant = config({
    HIVE_ONBOARDING_CASH_FEE_USD: '7.50',
    HIVE_ONBOARDING_STARTER_HP: '12.500',
    HIVE_ONBOARDING_MIN_REMAINING_HP: '25.000',
    HIVE_ONBOARDING_LOW_ACT_THRESHOLD: '7',
    HIVE_ONBOARDING_REQUEST_RATE_MAX: '500',
    HIVE_ONBOARDING_MAX_LIVE_REQUESTS: '5000',
    HIVE_ONBOARDING_MAX_DAILY_REQUESTS: '100000',
  });
  assert.equal(merchant.cashFeeUsd, '7.50');
  assert.equal(merchant.starterHp.display, '12.500 HP');
  assert.equal(merchant.minRemainingHp.display, '25.000 HP');
  assert.equal(merchant.lowActThreshold, 7);
  assert.equal(merchant.requestRateMax, 500);
  assert.equal(merchant.maxLiveRequests, 5000);
  assert.equal(merchant.maxDailyRequests, 100000);
  assert.equal(MIN_ONBOARDING_REMAINING_HP, '10.000');

  assert.throws(() => config({ HIVE_ONBOARDING_MIN_REMAINING_HP: '9.999' }), /at least 10\.000/);
  assert.throws(() => config({ HIVE_ONBOARDING_CASH_FEE_USD: '5' }), /two decimals/);
  assert.throws(() => config({ HIVE_ONBOARDING_LOW_ACT_THRESHOLD: '0' }), /between 1 and 1000/);
});

test('C2-F.1 warns below the ACT threshold without blocking an otherwise safe request', async () => {
  const service = new OnboardingService({ rpcPool: rpc({ pending: 2 }), config: config() });
  const created = await service.createRequest(createPayload('low_act_warning_key_00000000000000001'));
  const readiness = await service.resourceReadiness(created.request.id, { staffAccount: 'etblink' });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.accountTokenAvailable, true);
  assert.equal(readiness.accountTokenCount, 2);
  assert.equal(readiness.accountTokenLow, true);
  assert.equal(readiness.lowActThreshold, 3);
  assert.match(readiness.warning, /ACT inventory is low/i);
  assert.equal(readiness.minRemainingHp, '10.000 HP');
  assert.equal(readiness.postDelegationReserveAvailable, true);
});

test('C2-F.1 preserves the mandatory post-delegation HP reserve at prepare and broadcast', async () => {
  const insufficient = new OnboardingService({
    rpcPool: rpc({ vestingShares: '29999.000000 VESTS' }),
    config: config(),
  });
  const blocked = await insufficient.createRequest(createPayload('reserve_prepare_key_00000000000000001'));
  const readiness = await insufficient.resourceReadiness(blocked.request.id, { staffAccount: 'etblink' });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.postDelegationReserveAvailable, false);
  assert.match(readiness.message, /10\.000 HP reserve/);
  await assert.rejects(
    insufficient.prepare(blocked.request.id, { staffAccount: 'etblink', cashConfirmed: true }),
    /10\.000 HP reserve/,
  );

  let vestingShares = '100000.000000 VESTS';
  const dynamicRpc = rpc();
  const wrapped = { async call(api, method, params) {
    if (`${api}.${method}` === 'condenser_api.get_accounts' && params[0].includes('etblink')) {
      const rows = await dynamicRpc.call(api, method, params);
      return rows.map((row) => row.name === 'etblink' ? { ...row, vesting_shares: vestingShares } : row);
    }
    return dynamicRpc.call(api, method, params);
  } };
  const service = new OnboardingService({ rpcPool: wrapped, config: config() });
  const created = await service.createRequest(createPayload('reserve_broadcast_key_0000000000000001'));
  await service.prepare(created.request.id, { staffAccount: 'etblink', cashConfirmed: true });
  vestingShares = '25000.000000 VESTS';
  await assert.rejects(
    service.beginBroadcast(created.request.id, { staffAccount: 'etblink' }),
    /retaining the required 10\.000 HP reserve/,
  );
  assert.equal((await service.staffStatus(created.request.id, 'etblink')).status, 'prepared');
});

test('C2-F config and source assets keep activation explicit and browser custody local', () => {
  const disabled = parseOnboardingConfig({}, configFrom().hive);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.cashFeeUsd, '5.00');
  assert.equal(disabled.starterHp.display, '5.000 HP');
  assert.equal(disabled.minRemainingHp.display, '10.000 HP');
  assert.equal(disabled.lowActThreshold, 3);
  assert.throws(() => config({ HIVE_ONBOARDING_DB_PATH: 'relative.sqlite3' }), /absolute/);
  assert.throws(() => config({ HIVE_ONBOARDING_MAX_LIVE_REQUESTS: '20', HIVE_ONBOARDING_MAX_DAILY_REQUESTS: '10' }), /daily/i);

  const customer = read('public/js/onboarding-customer.js');
  assert.match(customer, /URL\.revokeObjectURL/);
  assert.match(customer, /removeAttribute\('href'\)/);
  assert.match(customer, /sessionStorage\.setItem/);
  assert.doesNotMatch(customer, /localStorage/);
  const trackingWrite = customer.match(/sessionStorage\.setItem\([\s\S]*?\);/u)?.[0] || '';
  for (const forbidden of ['masterPassword', 'privateKey', 'publicKeys', 'derived']) assert.doesNotMatch(trackingWrite, new RegExp(forbidden));

  const staff = read('public/js/onboarding-staff.js');
  assert.match(staff, /currentRequest\?\.cashFeeUsd/);
  assert.match(staff, /ACT inventory is below its warning threshold/);
  assert.doesNotMatch(staff, /\$5 cash onboarding fee/);

  const env = read('ops/privex/hive-bar.env.example');
  assert.match(env, /^HIVE_ONBOARDING_ENABLED=false$/m);
  assert.match(env, /^HIVE_ONBOARDING_CREATOR_ACCOUNT=fourthstreetbar$/m);
  assert.match(env, /^HIVE_ONBOARDING_CASH_FEE_USD=5\.00$/m);
  assert.match(env, /^HIVE_ONBOARDING_MIN_REMAINING_HP=10\.000$/m);
  assert.match(env, /^HIVE_ONBOARDING_LOW_ACT_THRESHOLD=3$/m);
  assert.match(env, /^HIVE_ONBOARDING_DB_PATH=\/var\/lib\/hive-bar\/onboarding\/onboarding\.sqlite3$/m);
  const helper = read('ops/privex/bin/hive-bar-prepare-onboarding-storage');
  assert.match(helper, /onboarding is not enabled/i);
  const dropIn = read('ops/privex/hive-bar-onboarding.service.d/10-onboarding-storage.conf');
  assert.match(dropIn, /\/var\/lib\/hive-bar\/onboarding/);
});
