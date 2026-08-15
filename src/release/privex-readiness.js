'use strict';

const { assertReadOnlyRelease } = require('./read-only-readiness');
const { PAYMENT_DB_PATH, isSafePaymentDatabasePath } = require('./payment-storage');

const RELEASE_PUBLIC_HOST = 'fourthstreetbar.com';

const PRIVEX_EXPLICIT_SETTINGS = Object.freeze([
  'HIVE_BAR_HOST',
  'PORT',
  'HIVE_PAYMENT_RECEIPT_DB_PATH',
]);

const DNS_HOST_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function hasOwn(source, name) {
  return Object.prototype.hasOwnProperty.call(source, name);
}

function normalizePublicHost(value) {
  const host = String(value || '').trim().toLowerCase();
  if (!DNS_HOST_PATTERN.test(host)) return null;
  return host;
}

function assertPrivexReadOnlyRelease(config, source = {}) {
  const base = assertReadOnlyRelease(config, source);
  const issues = [];
  const missing = PRIVEX_EXPLICIT_SETTINGS.filter((name) => !hasOwn(source, name));
  const suppliedHost = String(source.HIVE_BAR_HOST || '');
  const publicHost = normalizePublicHost(suppliedHost);
  const durableReceiptObservation = config.payments.receiptDbPath === PAYMENT_DB_PATH;

  if (missing.length > 0) {
    issues.push(`Privex decisions are required for ${missing.join(', ')}`);
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
  if (
    config.payments.receiptDbPath !== ':memory:' &&
    !isSafePaymentDatabasePath(config.payments.receiptDbPath)
  ) {
    issues.push(`HIVE_PAYMENT_RECEIPT_DB_PATH must be :memory: or exactly ${PAYMENT_DB_PATH} with no symlink target`);
  }
  if (durableReceiptObservation) {
    if (config.hive.signerMode !== 'disabled') {
      issues.push('HIVE_SIGNER_MODE must be disabled for durable read-only receipt observation');
    }
    if (
      config.payments.merchantAccounts.length !== 1 ||
      config.payments.merchantAccounts[0] !== 'fourthstreetbar'
    ) {
      issues.push('durable read-only receipt observation must remain bound to @fourthstreetbar');
    }
    if (config.payments.maxHbd !== '1.000 HBD') {
      issues.push('durable read-only receipt observation must retain the 1.000 HBD ceiling');
    }
    if (
      config.hive.m9PilotControlPath ||
      config.hive.m10OperatorArmedUntil ||
      config.hive.m10OperatorAuditPath ||
      config.hive.m12MerchantAuthor ||
      config.hive.m12AuthorizedSigners.length
    ) {
      issues.push('durable read-only receipt observation must contain no M9/M10/M12 posting-control state');
    }
  }
  if (/replace_with|change_me|example_secret/i.test(String(source.SESSION_SECRET || ''))) {
    issues.push('SESSION_SECRET must not contain an example placeholder');
  }

  if (issues.length > 0) {
    throw new Error(`Privex release gate failed: ${issues.join('; ')}`);
  }

  const topology = {
    ...base,
    profile: durableReceiptObservation
      ? 'privex-public-read-only-durable-receipts'
      : 'privex-public-read-only',
    provider: 'Privex',
    package: 'V1-US-NVME',
    region: 'US West',
    operatingSystem: 'Debian 13',
    topology: 'single-instance-cloudflare-caddy',
    edgeProxy: 'Cloudflare',
    tlsMode: 'full-strict',
    visitorIpHeader: 'CF-Connecting-IP',
    publicHost,
    port: config.server.port,
  };
  if (durableReceiptObservation) {
    topology.receiptDatabase = PAYMENT_DB_PATH;
    topology.receiptObservation = true;
  }
  return Object.freeze(topology);
}

module.exports = {
  PRIVEX_EXPLICIT_SETTINGS,
  RELEASE_PUBLIC_HOST,
  assertPrivexReadOnlyRelease,
  normalizePublicHost,
};
