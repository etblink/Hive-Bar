'use strict';

const { BETA_ACTIONS } = require('../beta/actions');
const { RELEASE_APP_TAG } = require('./read-only-readiness');
const { PAYMENT_DB_PATH, isSafePaymentDatabasePath } = require('./payment-storage');
const { RELEASE_PUBLIC_HOST, normalizePublicHost } = require('./privex-readiness');

const BETA_EXPLICIT_SETTINGS = Object.freeze([
  'NODE_ENV',
  'HIVE_BAR_HOST',
  'PORT',
  'BIND_HOST',
  'HIVE_WRITE_MODE',
  'HIVE_SIGNER_MODE',
  'HIVE_CONTROLLED_ACCOUNTS',
  'HIVE_CONTROLLED_ACTIONS',
  'HIVE_PAYMENT_RECEIPT_DB_PATH',
  'HIVE_APP_TAG',
  'DISTRIATOR_ENABLED',
  'TRUST_PROXY',
  'LOG_LEVEL',
]);

function hasOwn(source, name) {
  return Object.prototype.hasOwnProperty.call(source, name);
}

function assertPrivexBetaRelease(config, source = {}) {
  const issues = [];
  const missing = BETA_EXPLICIT_SETTINGS.filter((name) => !hasOwn(source, name));
  const suppliedHost = String(source.HIVE_BAR_HOST || '');
  const publicHost = normalizePublicHost(suppliedHost);

  if (missing.length > 0) {
    issues.push(`explicit beta decisions are required for ${missing.join(', ')}`);
  }
  if (config.env !== 'production') {
    issues.push('NODE_ENV must be production');
  }
  if (config.hive.writeMode !== 'beta') {
    issues.push('HIVE_WRITE_MODE must be beta');
  }
  if (config.hive.signerMode !== 'keychain' || !config.hive.betaSelfSigningEnabled) {
    issues.push('HIVE_SIGNER_MODE must be keychain and beta self-signing must be enabled');
  }
  if (config.hive.controlledAccounts.length !== 0) {
    issues.push('HIVE_CONTROLLED_ACCOUNTS must be explicitly empty');
  }
  if (config.hive.controlledActions.length !== 0) {
    issues.push('HIVE_CONTROLLED_ACTIONS must be explicitly empty in beta mode');
  }
  if (config.hive.appTag !== RELEASE_APP_TAG) {
    issues.push(`HIVE_APP_TAG must be exactly ${RELEASE_APP_TAG}`);
  }
  if (config.payments.enabled) {
    issues.push('the Pay broadcast lane must remain disabled');
  }
  if (config.distriator.enabled) {
    issues.push('DISTRIATOR_ENABLED must be false');
  }
  if (!publicHost || suppliedHost !== publicHost) {
    issues.push('HIVE_BAR_HOST must be a canonical DNS hostname without a scheme, port, or path');
  }
  if (publicHost && publicHost !== RELEASE_PUBLIC_HOST) {
    issues.push(`HIVE_BAR_HOST must be exactly ${RELEASE_PUBLIC_HOST}`);
  }
  if (config.auth.appOrigin !== `https://${publicHost}`) {
    issues.push('APP_ORIGIN must exactly match https://HIVE_BAR_HOST');
  }
  if (config.server.bindHost !== '127.0.0.1') {
    issues.push('BIND_HOST must be 127.0.0.1 behind the local Caddy proxy');
  }
  if (config.server.port !== 3000) {
    issues.push('PORT must be 3000 to match the reviewed Caddy and health-check assets');
  }
  if (config.server.trustProxy !== 'loopback') {
    issues.push('TRUST_PROXY must be exactly loopback so only the local Caddy peer is trusted');
  }
  if (config.hive.rpcNodes.length < 3) {
    issues.push('at least three distinct Hive RPC nodes are required');
  }
  if (
    config.payments.receiptDbPath !== ':memory:' &&
    !isSafePaymentDatabasePath(config.payments.receiptDbPath)
  ) {
    issues.push(`HIVE_PAYMENT_RECEIPT_DB_PATH must be :memory: or exactly ${PAYMENT_DB_PATH} with no symlink target`);
  }
  if (
    config.hive.m9PilotControlPath ||
    config.hive.m10OperatorArmedUntil ||
    config.hive.m10OperatorAuditPath ||
    config.hive.m12MerchantAuthor ||
    config.hive.m12AuthorizedSigners.length
  ) {
    issues.push('beta mode must contain no M9/M10/M12 controlled or delegated posting state');
  }
  if (/replace_with|change_me|example_secret/i.test(String(source.SESSION_SECRET || ''))) {
    issues.push('SESSION_SECRET must not contain an example placeholder');
  }

  if (issues.length > 0) {
    throw new Error(`Privex beta release gate failed: ${issues.join('; ')}`);
  }

  return Object.freeze({
    profile: 'privex-beta-self-signing',
    environment: config.env,
    provider: 'Privex',
    topology: 'single-instance-cloudflare-caddy',
    publicHost,
    origin: config.auth.appOrigin,
    bindHost: config.server.bindHost,
    port: config.server.port,
    trustProxy: config.server.trustProxy,
    writeMode: config.hive.writeMode,
    signerMode: config.hive.signerMode,
    betaActions: BETA_ACTIONS,
    controlledAccountCount: config.hive.controlledAccounts.length,
    controlledActionCount: config.hive.controlledActions.length,
    paymentsEnabled: config.payments.enabled,
    distriatorEnabled: config.distriator.enabled,
    rpcNodeCount: config.hive.rpcNodes.length,
    appTag: config.hive.appTag,
    logLevel: config.logging.level,
  });
}

module.exports = {
  BETA_EXPLICIT_SETTINGS,
  assertPrivexBetaRelease,
};
