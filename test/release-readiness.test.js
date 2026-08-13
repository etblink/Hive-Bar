'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadConfig } = require('../src/config');
const {
  EXPLICIT_READ_ONLY_SETTINGS,
  assertReadOnlyRelease,
} = require('../src/release/read-only-readiness');

function productionSource(overrides = {}) {
  return {
    NODE_ENV: 'production',
    BIND_HOST: '127.0.0.1',
    SITE_NAME: '4th Street Bar',
    BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
    BAR_PHONE: '(775) 324-7827',
    BAR_HOURS: 'Daily, 12:00 p.m.–2:00 a.m.',
    BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
    BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno',
    HIVE_COMMUNITY_ID: 'hive-108590',
    THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
    HIVE_RPC_NODES:
      'https://api.hive.blog,https://api.deathwing.me,https://api.openhive.network',
    HIVE_WRITE_MODE: 'disabled',
    HIVE_CONTROLLED_ACCOUNTS: '',
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_PAYMENT_MERCHANT_ACCOUNTS: 'fourthstreetbar',
    HIVE_PAYMENT_MAX_HBD: '1.000 HBD',
    HIVE_PAYMENT_RECEIPT_DB_PATH: ':memory:',
    DISTRIATOR_ENABLED: 'false',
    DISTRIATOR_CLAIM_URL: 'https://distriator.com/#/claim',
    HIVE_APP_TAG: 'fourth-street-bar-app/0.1.0',
    APP_ORIGIN: 'https://hive-bar.example',
    SESSION_SECRET: 'a-production-session-secret-with-32-bytes',
    TRUST_PROXY: 'false',
    LOG_LEVEL: 'info',
    ...overrides,
  };
}

function configFrom(source) {
  return loadConfig(source, { loadDotenv: false });
}

test('binds a redacted, explicitly configured public read-only release profile', () => {
  const source = productionSource();
  const config = configFrom(source);
  const summary = assertReadOnlyRelease(config, source);

  assert.deepEqual(summary, {
    profile: 'public-read-only',
    environment: 'production',
    origin: 'https://hive-bar.example',
    bindHost: '127.0.0.1',
    writeMode: 'disabled',
    controlledAccountCount: 0,
    appTag: 'fourth-street-bar-app/0.1.0',
    paymentsEnabled: false,
    distriatorEnabled: false,
    rpcNodeCount: 3,
    trustProxy: false,
    logLevel: 'info',
  });
  assert.equal(JSON.stringify(summary).includes(source.SESSION_SECRET), false);
  assert.equal(Object.isFrozen(summary), true);
});

test('requires every release-specific safety decision to be explicit', () => {
  for (const name of EXPLICIT_READ_ONLY_SETTINGS) {
    const source = productionSource();
    delete source[name];

    if (name === 'NODE_ENV') {
      source.NODE_ENV = 'development';
      const config = configFrom(source);
      delete source.NODE_ENV;
      assert.throws(() => assertReadOnlyRelease(config, source), /NODE_ENV/);
      continue;
    }

    assert.throws(() => {
      const config = configFrom(source);
      return assertReadOnlyRelease(config, source);
    }, new RegExp(name));
  }
});

test('rejects controlled writes, latent account scope, payments, and Distriator', () => {
  const controlledSource = productionSource({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink',
    HIVE_PAYMENT_RECEIPT_DB_PATH: '/var/lib/hive-bar/receipts.sqlite',
  });
  assert.throws(
    () => assertReadOnlyRelease(configFrom(controlledSource), controlledSource),
    /HIVE_WRITE_MODE must be disabled.*HIVE_CONTROLLED_ACCOUNTS.*payment preparation must be disabled/,
  );

  const latentAccountSource = productionSource({ HIVE_CONTROLLED_ACCOUNTS: 'etblink' });
  assert.throws(
    () => assertReadOnlyRelease(configFrom(latentAccountSource), latentAccountSource),
    /HIVE_CONTROLLED_ACCOUNTS must be explicitly empty/,
  );

  const distriatorSource = productionSource({ DISTRIATOR_ENABLED: 'true' });
  assert.throws(
    () => assertReadOnlyRelease(configFrom(distriatorSource), distriatorSource),
    /DISTRIATOR_ENABLED must be false/,
  );

  const wrongTagSource = productionSource({ HIVE_APP_TAG: 'another-app/0.1.0' });
  assert.throws(
    () => assertReadOnlyRelease(configFrom(wrongTagSource), wrongTagSource),
    /HIVE_APP_TAG must be exactly fourth-street-bar-app\/0\.1\.0/,
  );
});

test('rejects a development runtime even when all write surfaces are disabled', () => {
  const source = productionSource({ NODE_ENV: 'development', APP_ORIGIN: 'https://hive-bar.example' });
  const config = configFrom(source);

  assert.throws(() => assertReadOnlyRelease(config, source), /NODE_ENV must be production/);
});
