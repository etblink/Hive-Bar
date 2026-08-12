'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadConfig } = require('../src/config');

function configFrom(overrides = {}) {
  return loadConfig(
    {
      NODE_ENV: 'test',
      HIVE_WRITE_MODE: 'disabled',
      ...overrides,
    },
    { loadDotenv: false },
  );
}

test('loads the accepted identifiers, secure session settings, and write-disabled defaults', () => {
  const config = configFrom();

  assert.equal(config.hive.communityId, 'hive-108590');
  assert.equal(config.hive.threadsContainerAccount, 'fourthst.threads');
  assert.equal(config.hive.writeMode, 'disabled');
  assert.equal(config.hive.writesEnabled, false);
  assert.deepEqual(config.hive.controlledAccounts, []);
  assert.equal(config.hive.defaultWallFee, '1.000 HBD');
  assert.deepEqual(config.hive.globalWallExclusions, []);
  assert.equal(config.hive.messageHistoryPageSize, 25);
  assert.equal(config.auth.appOrigin, 'http://localhost:3000');
  assert.ok(config.auth.sessionSecret.length >= 32);
  assert.equal(config.site.business.address, '1114 E. 4th Street, Reno, NV 89512');
  assert.equal(config.site.business.phone, '(775) 324-7827');
  assert.equal(config.site.business.websiteUrl, 'https://4thstreetbarreno.com/');
  assert.equal(config.server.port, 3000);
  assert.equal(config.hive.rpcNodes.length, 3);
});

test('rejects a production configuration with fewer than three RPC nodes', () => {
  assert.throws(
    () =>
      configFrom({
        NODE_ENV: 'production',
        SITE_NAME: '4th Street Bar',
        BAR_ADDRESS: '1114 E. 4th Street, Reno, NV 89512',
        BAR_PHONE: '(775) 324-7827',
        BAR_HOURS: 'Daily, noon–2:00 a.m.',
        BAR_WEBSITE_URL: 'https://4thstreetbarreno.com/',
        BAR_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=4th+Street+Bar+Reno',
        HIVE_COMMUNITY_ID: 'hive-108590',
        THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
        HIVE_RPC_NODES: 'https://api.hive.blog',
        HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
        APP_ORIGIN: 'https://hive-bar.example',
        SESSION_SECRET: 'a-production-session-secret-with-32-bytes',
      }),
    /Production requires at least three distinct Hive RPC nodes/,
  );
});

test('fails closed when production settings are only implicit defaults', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }, { loadDotenv: false }),
    /production requires explicit SITE_NAME, BAR_ADDRESS, BAR_PHONE, BAR_HOURS, BAR_WEBSITE_URL, BAR_MAP_URL, HIVE_COMMUNITY_ID, THREADS_CONTAINER_ACCOUNT, HIVE_RPC_NODES, HIVE_WRITE_MODE, HIVE_WALL_DEFAULT_FEE, APP_ORIGIN, SESSION_SECRET/,
  );
});

test('allows only explicitly account-scoped controlled mode and still rejects production mode', () => {
  const controlled = configFrom({
    HIVE_WRITE_MODE: 'controlled',
    HIVE_CONTROLLED_ACCOUNTS: 'etblink, etblink',
  });
  assert.equal(controlled.hive.writesEnabled, true);
  assert.deepEqual(controlled.hive.controlledAccounts, ['etblink']);

  assert.throws(
    () => configFrom({ HIVE_WRITE_MODE: 'controlled' }),
    /Controlled mode requires at least one explicitly allowlisted Hive account/,
  );
  assert.throws(
    () => configFrom({ HIVE_WRITE_MODE: 'production' }),
    /Production write mode is not authorized before the V1 release gate/,
  );
});

test('validates the canonical M4 wall fee and both normalized exclusion layers', () => {
  const config = configFrom({
    HIVE_WALL_DEFAULT_FEE: '1.000 HBD',
    HIVE_GLOBAL_WALL_EXCLUSIONS: 'rewardbot, spammer, rewardbot',
    HIVE_MESSAGE_HISTORY_PAGE_SIZE: '50',
  });
  assert.equal(config.hive.defaultWallFee, '1.000 HBD');
  assert.deepEqual(config.hive.globalWallExclusions, ['rewardbot', 'spammer']);
  assert.equal(config.hive.messageHistoryPageSize, 50);
  assert.throws(() => configFrom({ HIVE_WALL_DEFAULT_FEE: '1.00 HBD' }), /three decimals/);
  assert.throws(() => configFrom({ HIVE_WALL_DEFAULT_FEE: '0.000 HBD' }), /positive HBD/);
});

test('rejects insecure or credential-bearing RPC URLs', () => {
  assert.throws(
    () => configFrom({ HIVE_RPC_NODES: 'http://api.hive.blog' }),
    /credential-free HTTPS URL/,
  );
  assert.throws(
    () => configFrom({ HIVE_RPC_NODES: 'https://user:secret@example.com' }),
    /credential-free HTTPS URL/,
  );
});

test('normalizes and de-duplicates RPC nodes', () => {
  const config = configFrom({
    HIVE_RPC_NODES: ' https://api.hive.blog,https://api.hive.blog,https://api.openhive.network ',
  });

  assert.deepEqual(config.hive.rpcNodes, [
    'https://api.hive.blog',
    'https://api.openhive.network',
  ]);
  assert.equal(Object.isFrozen(config.hive.rpcNodes), true);
  assert.equal(Object.isFrozen(config.hive), true);
});
