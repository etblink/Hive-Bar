'use strict';

const { assertReadOnlyRelease } = require('./read-only-readiness');

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
  if (config.server.trustProxy !== 1) {
    issues.push('TRUST_PROXY must be exactly 1 for the single local Caddy hop');
  }
  if (config.payments.receiptDbPath !== ':memory:') {
    issues.push('HIVE_PAYMENT_RECEIPT_DB_PATH must be :memory: for the inert read-only profile');
  }
  if (/replace_with|change_me|example_secret/i.test(String(source.SESSION_SECRET || ''))) {
    issues.push('SESSION_SECRET must not contain an example placeholder');
  }

  if (issues.length > 0) {
    throw new Error(`Privex release gate failed: ${issues.join('; ')}`);
  }

  return Object.freeze({
    ...base,
    profile: 'privex-public-read-only',
    provider: 'Privex',
    package: 'V1-US-NVME',
    region: 'US West',
    operatingSystem: 'Debian 12',
    topology: 'single-instance-caddy',
    publicHost,
    port: config.server.port,
  });
}

module.exports = {
  PRIVEX_EXPLICIT_SETTINGS,
  RELEASE_PUBLIC_HOST,
  assertPrivexReadOnlyRelease,
  normalizePublicHost,
};
