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

test('loads the approved M1 identifiers and safe defaults', () => {
  const config = configFrom();

  assert.equal(config.hive.communityId, 'hive-108590');
  assert.equal(config.hive.threadsContainerAccount, 'fourthst.threads');
  assert.equal(config.hive.writeMode, 'disabled');
  assert.equal(config.hive.writesEnabled, false);
  assert.equal(config.server.port, 3000);
  assert.equal(config.hive.rpcNodes.length, 3);
});

test('rejects a production configuration with fewer than three RPC nodes', () => {
  assert.throws(
    () =>
      configFrom({
        NODE_ENV: 'production',
        SITE_NAME: '4th Street Bar',
        HIVE_COMMUNITY_ID: 'hive-108590',
        THREADS_CONTAINER_ACCOUNT: 'fourthst.threads',
        HIVE_RPC_NODES: 'https://api.hive.blog',
      }),
    /Production requires at least three distinct Hive RPC nodes/,
  );
});

test('fails closed when production settings are only implicit defaults', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production' }, { loadDotenv: false }),
    /production requires explicit SITE_NAME, HIVE_COMMUNITY_ID, THREADS_CONTAINER_ACCOUNT, HIVE_RPC_NODES, HIVE_WRITE_MODE/,
  );
});

test('rejects write-enabled modes during M1', () => {
  assert.throws(
    () => configFrom({ HIVE_WRITE_MODE: 'controlled' }),
    /M1 permits only HIVE_WRITE_MODE=disabled/,
  );
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
