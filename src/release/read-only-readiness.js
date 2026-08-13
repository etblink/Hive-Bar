'use strict';

const EXPLICIT_READ_ONLY_SETTINGS = Object.freeze([
  'NODE_ENV',
  'BIND_HOST',
  'HIVE_WRITE_MODE',
  'HIVE_CONTROLLED_ACCOUNTS',
  'DISTRIATOR_ENABLED',
  'TRUST_PROXY',
  'LOG_LEVEL',
]);

function hasOwn(source, name) {
  return Object.prototype.hasOwnProperty.call(source, name);
}

function assertReadOnlyRelease(config, source = {}) {
  const issues = [];
  const missing = EXPLICIT_READ_ONLY_SETTINGS.filter((name) => !hasOwn(source, name));

  if (missing.length > 0) {
    issues.push(`explicit safety decisions are required for ${missing.join(', ')}`);
  }
  if (config.env !== 'production') {
    issues.push('NODE_ENV must be production');
  }
  if (config.hive.writeMode !== 'disabled' || config.hive.writesEnabled) {
    issues.push('HIVE_WRITE_MODE must be disabled');
  }
  if (config.hive.controlledAccounts.length !== 0) {
    issues.push('HIVE_CONTROLLED_ACCOUNTS must be explicitly empty');
  }
  if (config.payments.enabled) {
    issues.push('payment preparation must be disabled');
  }
  if (config.distriator.enabled) {
    issues.push('DISTRIATOR_ENABLED must be false');
  }
  if (!config.auth.appOrigin.startsWith('https://')) {
    issues.push('APP_ORIGIN must use HTTPS');
  }
  if (config.hive.rpcNodes.length < 3) {
    issues.push('at least three distinct Hive RPC nodes are required');
  }

  if (issues.length > 0) {
    throw new Error(`Read-only release gate failed: ${issues.join('; ')}`);
  }

  return Object.freeze({
    profile: 'public-read-only',
    environment: config.env,
    origin: config.auth.appOrigin,
    bindHost: config.server.bindHost,
    writeMode: config.hive.writeMode,
    controlledAccountCount: config.hive.controlledAccounts.length,
    paymentsEnabled: config.payments.enabled,
    distriatorEnabled: config.distriator.enabled,
    rpcNodeCount: config.hive.rpcNodes.length,
    trustProxy: config.server.trustProxy,
    logLevel: config.logging.level,
  });
}

module.exports = {
  EXPLICIT_READ_ONLY_SETTINGS,
  assertReadOnlyRelease,
};
