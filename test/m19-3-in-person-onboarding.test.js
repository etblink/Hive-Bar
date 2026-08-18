'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { parseOnboardingConfig } = require('../src/onboarding/config');
const { buildOnboardingOperations, hpToVests } = require('../src/onboarding/operations');
const { OnboardingRequestStore } = require('../src/onboarding/request-store');
const { OnboardingService } = require('../src/onboarding/service');
const { requireHivePublicKey, requireNewHiveAccountName } = require('../src/onboarding/validation');
const { configFrom } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');

async function keys(seed = 'm19-3') {
  const { PrivateKey } = await import('hive-tx');
  return Object.fromEntries(['owner', 'active', 'posting', 'memo'].map((role) => [
    role,
    PrivateKey.fromSeed(`${seed}-${role}`).createPublic().toString(),
  ]));
}

function enabledConfig() {
  return parseOnboardingConfig({
    HIVE_ONBOARDING_ENABLED: 'true',
    HIVE_ONBOARDING_CREATOR_ACCOUNT: 'etblink',
    HIVE_ONBOARDING_STARTER_HP: '5.000',
    HIVE_ONBOARDING_REQUEST_TTL_MS: '900000',
  }, configFrom({ HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain' }).hive);
}

function rpc(publicKeys, { pending = 2, created = false } = {}) {
  return {
    getStatus: () => [],
    async call(api, method, params) {
      if (`${api}.${method}` === 'condenser_api.get_accounts') {
        const names = params[0];
        const rows = [];
        if (names.includes('etblink')) rows.push({
          name: 'etblink', pending_claimed_accounts: pending,
          vesting_shares: '100000.000000 VESTS', delegated_vesting_shares: '0.000000 VESTS',
          to_withdraw: '0', withdrawn: '0',
        });
        if (created && names.includes('newhiver')) rows.push({
          name: 'newhiver',
          owner: { weight_threshold: 1, account_auths: [], key_auths: [[publicKeys.owner, 1]] },
          active: { weight_threshold: 1, account_auths: [], key_auths: [[publicKeys.active, 1]] },
          posting: { weight_threshold: 1, account_auths: [], key_auths: [[publicKeys.posting, 1]] },
          memo_key: publicKeys.memo,
        });
        return rows;
      }
      if (`${api}.${method}` === 'condenser_api.get_dynamic_global_properties') {
        return { total_vesting_fund_hive: '1000.000 HIVE', total_vesting_shares: '2000000.000000 VESTS' };
      }
      if (`${api}.${method}` === 'condenser_api.get_vesting_delegations') {
        return created ? [{ delegator: 'etblink', delegatee: 'newhiver', vesting_shares: '10000.000000 VESTS' }] : [];
      }
      throw new Error(`unexpected RPC ${api}.${method}`);
    },
  };
}

test('M19.3 validates Hive usernames and STM public-key checksums', async () => {
  assert.equal(requireNewHiveAccountName('newhiver'), 'newhiver');
  assert.equal(requireNewHiveAccountName('bar.user'), 'bar.user');
  for (const invalid of ['ab', 'UPPER', '-alice', 'alice-', 'ab.cd', 'thisusernameistoolong']) {
    assert.throws(() => requireNewHiveAccountName(invalid));
  }
  const publicKeys = await keys();
  assert.equal(requireHivePublicKey(publicKeys.owner), publicKeys.owner);
  assert.throws(() => requireHivePublicKey(`${publicKeys.owner.slice(0, -1)}1`));
});

test('M19.3 is disabled by default and active only in beta + Keychain', () => {
  const disabled = parseOnboardingConfig({}, configFrom().hive);
  assert.equal(disabled.active, false);
  assert.equal(disabled.cashFeeUsd, '5.00');
  assert.equal(disabled.starterHp.display, '5.000 HP');
  assert.equal(enabledConfig().active, true);
  const readOnly = parseOnboardingConfig({
    HIVE_ONBOARDING_ENABLED: 'true', HIVE_ONBOARDING_CREATOR_ACCOUNT: 'etblink',
  }, configFrom().hive);
  assert.equal(readOnly.active, false);
});

test('M19.3 converts fixed HP to VESTS exactly and prepares only create + delegation', async () => {
  const publicKeys = await keys();
  const delegation = hpToVests(5000n, {
    total_vesting_fund_hive: '1000.000 HIVE',
    total_vesting_shares: '2000000.000000 VESTS',
  });
  assert.equal(delegation.canonical, '10000.000000 VESTS');
  const prepared = buildOnboardingOperations({ creator: 'etblink', username: 'newhiver', publicKeys, delegationVests: delegation });
  assert.deepEqual(prepared.operations.map(([name]) => name), ['create_claimed_account', 'delegate_vesting_shares']);
  assert.equal(prepared.authority, 'Active');
  assert.match(prepared.fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(prepared.operations.some(([name]) => name === 'transfer'), false);
  assert.deepEqual(prepared.operations[0][1].owner.key_auths, [[publicKeys.owner, 1]]);
});

test('M19.3 request store expires opaque requests and service requires cash, creator, ACT, and one attempt', async () => {
  let now = 1000;
  const publicKeys = await keys();
  const store = new OnboardingRequestStore({ ttlMs: 300000, now: () => now, createId: () => 'opaque_request_identifier_0123456789ABCDE' });
  const service = new OnboardingService({ rpcPool: rpc(publicKeys), config: enabledConfig(), store, now: () => now });
  const created = await service.createRequest({ username: 'newhiver', publicKeys, recoveryAcknowledged: true });
  assert.match(created.id, /^[A-Za-z0-9_-]{32,128}$/);
  await assert.rejects(service.prepare(created.id, { staffAccount: 'etblink', cashConfirmed: false }), /\$5\.00 cash/);
  await assert.rejects(service.prepare(created.id, { staffAccount: 'someoneelse', cashConfirmed: true }), /Sign in as @etblink/);
  const prepared = await service.prepare(created.id, { staffAccount: 'etblink', cashConfirmed: true });
  assert.deepEqual(prepared.operations.map(([name]) => name), ['create_claimed_account', 'delegate_vesting_shares']);
  service.beginBroadcast(created.id, { staffAccount: 'etblink' });
  assert.throws(() => service.beginBroadcast(created.id, { staffAccount: 'etblink' }), /not ready for Keychain|already reached Keychain/);
  now += 300001;
  assert.equal(store.get(created.id).status, 'expired');
});

test('M19.3 refuses preparation when the creator has no claimed-account token', async () => {
  const publicKeys = await keys();
  const service = new OnboardingService({ rpcPool: rpc(publicKeys, { pending: 0 }), config: enabledConfig() });
  const created = await service.createRequest({ username: 'newhiver', publicKeys, recoveryAcknowledged: true });
  await assert.rejects(service.prepare(created.id, { staffAccount: 'etblink', cashConfirmed: true }), /account-creation token/);
});

test('M19.3 observes exact account keys + exact delegation without rebroadcast', async () => {
  const publicKeys = await keys();
  let createdOnChain = false;
  const pool = { getStatus: () => [], async call(api, method, params) {
    return rpc(publicKeys, { created: createdOnChain }).call(api, method, params);
  } };
  const service = new OnboardingService({ rpcPool: pool, config: enabledConfig() });
  const request = await service.createRequest({ username: 'newhiver', publicKeys, recoveryAcknowledged: true });
  await service.prepare(request.id, { staffAccount: 'etblink', cashConfirmed: true });
  service.beginBroadcast(request.id, { staffAccount: 'etblink' });
  service.recordBroadcast(request.id, { staffAccount: 'etblink', ambiguous: true });
  assert.equal((await service.status(request.id)).status, 'observing');
  createdOnChain = true;
  assert.equal((await service.status(request.id)).status, 'complete');
  assert.throws(() => service.beginBroadcast(request.id, { staffAccount: 'etblink' }));
});

test('M19.3 browser and governance contracts preserve customer custody and separate live authorization', () => {
  const customer = read('public/js/onboarding-customer.js');
  const staff = read('public/js/onboarding-staff.js');
  const milestone = read('docs/M19_3_IN_PERSON_HIVE_ONBOARDING.md');
  const roadmap = read('docs/ROADMAP.md');
  assert.match(customer, /window\.crypto\.getRandomValues/);
  assert.match(customer, /PrivateKey\.fromLogin/);
  assert.match(customer, /publicKeys: publicKeys\(credentials\)/);
  assert.doesNotMatch(customer, /localStorage|sessionStorage/);
  assert.match(staff, /begin-broadcast/);
  assert.match(staff, /authority: 'Active'/);
  assert.match(staff, /Do not broadcast again|do not send this transaction again/i);
  assert.doesNotMatch(staff, /setInterval/);
  assert.match(milestone, /does not authorize consuming an account-creation token/i);
  assert.match(milestone, /does not authorize a Hive Power delegation/i);
  assert.match(milestone, /separate live acceptance authorization/i);
  assert.match(roadmap, /M19\.2[\s\S]*?\*\*Accepted\.\*\*/);
  assert.match(roadmap, /M19\.3[\s\S]*?\*\*Current\.\*\*/);
});
