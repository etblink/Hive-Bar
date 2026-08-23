'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const {
  EXPECTED_BROWSER_MODULE_VERSIONS,
  ONBOARDING_IMPORT_MAP,
  ONBOARDING_IMPORT_MAP_CSP_SOURCE,
  ONBOARDING_IMPORT_MAP_TEXT,
} = require('../src/onboarding/browser-modules');
const { parseOnboardingConfig } = require('../src/onboarding/config');
const { buildOnboardingOperations, hpToVests } = require('../src/onboarding/operations');
const { OnboardingRequestStore } = require('../src/onboarding/request-store');
const { OnboardingService } = require('../src/onboarding/service');
const { requireHivePublicKey, requireNewHiveAccountName } = require('../src/onboarding/validation');
const { configFrom, createFixtureApp } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const PUBLIC_KEYS = Object.freeze({
  owner: 'STM6pbYm2TgVWgzb3FsfwkZFLNEqCZ133eM5BDMQjEfGM1S6Uqus9',
  active: 'STM8mnuYALhWKgmEgg2ehxNEh62vKhKSg9gBUTctqSTiUXr1UKoMS',
  posting: 'STM67N3WrJNTjUxk2UDnDGKE7tjZbCysYesfHW382t4o6TyTnYrnT',
  memo: 'STM6Z5YnEj9n5LnPpfhg7P2oT36nzhxy982q4xPt3FxvEtkh3Ksjr',
});

function enabledConfig(overrides = {}) {
  return parseOnboardingConfig({
    HIVE_ONBOARDING_ENABLED: 'true',
    HIVE_ONBOARDING_CREATOR_ACCOUNT: 'etblink',
    HIVE_ONBOARDING_STARTER_HP: '5.000',
    HIVE_ONBOARDING_REQUEST_TTL_MS: '900000',
    ...overrides,
  }, configFrom({ HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain' }).hive);
}

function rpc({ pending = 2, created = false } = {}) {
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
          owner: { weight_threshold: 1, account_auths: [], key_auths: [[PUBLIC_KEYS.owner, 1]] },
          active: { weight_threshold: 1, account_auths: [], key_auths: [[PUBLIC_KEYS.active, 1]] },
          posting: { weight_threshold: 1, account_auths: [], key_auths: [[PUBLIC_KEYS.posting, 1]] },
          memo_key: PUBLIC_KEYS.memo,
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

test('M19.3 validates Hive usernames and STM public-key checksums', () => {
  assert.equal(requireNewHiveAccountName('newhiver'), 'newhiver');
  assert.equal(requireNewHiveAccountName('bar.user'), 'bar.user');
  assert.throws(() => requireNewHiveAccountName('UPPER'));
  assert.equal(requireHivePublicKey(PUBLIC_KEYS.owner), PUBLIC_KEYS.owner);
});

test('M19.3 remains disabled by default and active only in beta + Keychain', () => {
  const disabled = parseOnboardingConfig({}, configFrom().hive);
  assert.equal(disabled.active, false);
  assert.equal(disabled.cashFeeUsd, '5.00');
  assert.equal(disabled.starterHp.display, '5.000 HP');
  assert.equal(enabledConfig().active, true);
});

test('M19.3 prepares only claimed-account creation plus exact starter delegation', () => {
  const delegation = hpToVests(5000n, {
    total_vesting_fund_hive: '1000.000 HIVE',
    total_vesting_shares: '2000000.000000 VESTS',
  });
  assert.equal(delegation.canonical, '10000.000000 VESTS');
  const prepared = buildOnboardingOperations({
    creator: 'etblink', username: 'newhiver', publicKeys: PUBLIC_KEYS, delegationVests: delegation,
  });
  assert.deepEqual(prepared.operations.map(([name]) => name), ['create_claimed_account', 'delegate_vesting_shares']);
  assert.equal(prepared.authority, 'Active');
  assert.equal(prepared.operations.some(([name]) => name === 'transfer'), false);
});

test('M19.3 preserves the one-way Keychain gate after request TTL passes', async () => {
  let now = 1000;
  const store = new OnboardingRequestStore({ ttlMs: 300000, now: () => now });
  const service = new OnboardingService({ rpcPool: rpc(), config: enabledConfig(), store, now: () => now });
  const created = await service.createRequest({
    idempotencyKey: 'm193_inherited_request_retry_key_00001',
    username: 'newhiver', publicKeys: PUBLIC_KEYS, recoveryAcknowledged: true,
  });
  const id = created.request.id;
  await service.prepare(id, { staffAccount: 'etblink', cashConfirmed: true });
  await service.beginBroadcast(id, { staffAccount: 'etblink' });
  now += 300001;
  assert.equal(store.get(id).status, 'signing');
  await assert.rejects(service.beginBroadcast(id, { staffAccount: 'etblink' }), /Keychain|prepared|retry/i);
});

test('M19.3 still refuses preparation without an account-creation token', async () => {
  const service = new OnboardingService({ rpcPool: rpc({ pending: 0 }), config: enabledConfig() });
  const created = await service.createRequest({
    idempotencyKey: 'm193_no_token_request_retry_key_000001',
    username: 'newhiver', publicKeys: PUBLIC_KEYS, recoveryAcknowledged: true,
  });
  await assert.rejects(
    service.prepare(created.request.id, { staffAccount: 'etblink', cashConfirmed: true }),
    /account-creation token/,
  );
});

test('M19.3.1 keeps the onboarding browser dependency graph pinned and same-origin', async () => {
  assert.deepEqual(EXPECTED_BROWSER_MODULE_VERSIONS, {
    'hive-tx': '7.2.0', '@noble/ciphers': '2.3.0', '@noble/curves': '2.3.0',
    '@noble/hashes': '2.3.0', bs58: '6.0.0', 'base-x': '5.0.1',
  });
  assert.equal(JSON.stringify(ONBOARDING_IMPORT_MAP), ONBOARDING_IMPORT_MAP_TEXT);
  for (const value of Object.values(ONBOARDING_IMPORT_MAP.imports)) assert.match(value, /^\/vendor\/onboarding\//);
  assert.match(ONBOARDING_IMPORT_MAP_CSP_SOURCE, /^'sha256-[A-Za-z0-9+/=]+'$/);

  const { app } = createFixtureApp({ configOverrides: { HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain' } });
  app.locals.onboardingEnvironment = {
    HIVE_ONBOARDING_ENABLED: 'true', HIVE_ONBOARDING_CREATOR_ACCOUNT: 'etblink',
    HIVE_ONBOARDING_STARTER_HP: '5.000', HIVE_ONBOARDING_REQUEST_TTL_MS: '900000',
  };
  const page = await request(app).get('/create-account').expect(200);
  assert.ok(page.headers['content-security-policy'].includes(ONBOARDING_IMPORT_MAP_CSP_SOURCE));
});

test('M19.3 custody and governance source contracts remain explicit', () => {
  const customer = read('public/js/onboarding-customer.js');
  const staff = read('public/js/onboarding-staff.js');
  const milestone = read('docs/M19_3_IN_PERSON_HIVE_ONBOARDING.md');
  assert.match(customer, /window\.crypto\.getRandomValues/);
  assert.match(customer, /PrivateKey\.fromLogin/);
  assert.match(customer, /publicKeys: publicKeys\(credentials\)/);
  assert.match(customer, /sessionStorage/);
  assert.match(customer, /URL\.revokeObjectURL/);
  assert.match(staff, /begin-broadcast/);
  assert.match(staff, /authority: 'Active'/);
  assert.match(milestone, /does not authorize consuming an account-creation token/i);
  assert.match(milestone, /does not authorize a Hive Power delegation/i);
  assert.match(milestone, /separate live acceptance authorization/i);
});
