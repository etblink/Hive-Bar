'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { assertReleaseCoherence } = require('../scripts/check-release-coherence');
const { loadDormantV1Config } = require('../scripts/check-v1-release');
const { RELEASE_APP_TAG, PACKAGE_VERSION } = require('../src/release/release-version');
const { assertPrivexV1Release } = require('../src/release/v1-readiness');
const { V1_ACTIONS, V1_ACTIVE_ACTIONS, V1_POSTING_ACTIONS } = require('../src/v1/actions');

const root = path.join(__dirname, '..');
const sessionSecret = 'm17-v1-release-test-secret-with-32-bytes';

function v1Source(overrides = {}) {
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
    HIVE_RPC_NODES:
      'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'production',
    HIVE_SIGNER_MODE: 'keychain',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_CONTROLLED_ACTIONS: '',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: RELEASE_APP_TAG,
    APP_ORIGIN: 'https://fourthstreetbar.com',
    SESSION_SECRET: sessionSecret,
    TRUST_PROXY: 'loopback',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

test('M20.2 supersedes the exact M17.1 V1 self-signing manifest', () => {
  assert.deepEqual(V1_POSTING_ACTIONS, [
    'post',
    'thread',
    'comment',
    'vote',
    'follow',
    'unfollow',
    'subscribe',
    'unsubscribe',
    'profile',
    'claim-rewards',
  ]);
  assert.deepEqual(V1_ACTIVE_ACTIONS, ['wall', 'inbox']);
  assert.deepEqual(V1_ACTIONS, [...V1_POSTING_ACTIONS, ...V1_ACTIVE_ACTIONS]);
  assert.equal(Object.isFrozen(V1_ACTIONS), true);
});

test('derives the application tag from the package version', () => {
  assert.equal(PACKAGE_VERSION, '0.1.0');
  assert.equal(RELEASE_APP_TAG, 'fourth-street-bar-app/0.1.0');
});

test('qualifies a dormant Privex V1 environment without enabling runtime production mode', () => {
  const source = v1Source();
  const config = loadDormantV1Config(source);
  const summary = assertPrivexV1Release(config, source);

  assert.equal(config.hive.writeMode, 'production');
  assert.equal(config.hive.betaSelfSigningEnabled, false);
  assert.equal(summary.profile, 'privex-v1-self-signing');
  assert.deepEqual(summary.v1Actions, V1_ACTIONS);
  assert.deepEqual(summary.v1PostingActions, V1_POSTING_ACTIONS);
  assert.deepEqual(summary.v1ActiveActions, V1_ACTIVE_ACTIONS);
  assert.equal(summary.paymentsEnabled, false);
  assert.equal(summary.distriatorEnabled, false);
  assert.equal(JSON.stringify(summary).includes(sessionSecret), false);
});

test('V1 release gate rejects controlled, payment, topology, and placeholder drift', () => {
  const cases = [
    [{ HIVE_CONTROLLED_ACCOUNTS: 'etblink' }, /HIVE_CONTROLLED_ACCOUNTS must be explicitly empty/],
    [{ HIVE_CONTROLLED_ACTIONS: 'post' }, /HIVE_CONTROLLED_ACTIONS must be explicitly empty/],
    [{ DISTRIATOR_ENABLED: 'true' }, /DISTRIATOR_ENABLED must be false/],
    [{ HIVE_BAR_HOST: 'other.example', APP_ORIGIN: 'https://other.example' }, /HIVE_BAR_HOST must be exactly fourthstreetbar\.com/],
    [{ TRUST_PROXY: '1' }, /TRUST_PROXY must be exactly loopback/],
    [{ SESSION_SECRET: 'REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES' }, /SESSION_SECRET must not contain an example placeholder/],
  ];

  for (const [overrides, expected] of cases) {
    const source = v1Source(overrides);
    assert.throws(() => assertPrivexV1Release(loadDormantV1Config(source), source), expected);
  }
});

test('runs the dormant V1 release check without network access or server startup', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-v1-release.js')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...v1Source() },
  });

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.profile, 'privex-v1-self-signing');
  assert.equal(result.stdout.includes(sessionSecret), false);
});

test('release and living-document sources are mechanically coherent', () => {
  assert.deepEqual(assertReleaseCoherence(), {
    packageVersion: '0.1.0',
    appTag: 'fourth-street-bar-app/0.1.0',
    v1ActionCount: 12,
  });
});
