'use strict';

const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');
const { createFixtureRpc } = require('./fixture-rpc');

const FIXTURE_NOW_MS = Date.parse('2026-08-11T12:00:00Z');

const logger = {
  child() {
    return this;
  },
  error() {},
  info() {},
  warn() {},
};

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

function createFixtureApp({ configOverrides = {}, rpcPool = createFixtureRpc() } = {}) {
  return {
    app: createApp({
      config: configFrom(configOverrides),
      logger,
      now: () => FIXTURE_NOW_MS,
      rpcPool,
    }),
    rpcPool,
  };
}

module.exports = { FIXTURE_NOW_MS, configFrom, createFixtureApp, logger };
