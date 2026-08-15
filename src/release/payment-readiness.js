'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RELEASE_PUBLIC_HOST, normalizePublicHost } = require('./privex-readiness');

const PAYMENT_DB_PATH = '/var/lib/hive-bar/payments/receipts.sqlite3';

function isSafePaymentDatabasePath(filename) {
  if (filename !== PAYMENT_DB_PATH || path.basename(filename) !== 'receipts.sqlite3') return false;
  const directory = path.dirname(filename);
  try {
    if (!fs.existsSync(directory)) return true;
    const directoryStat = fs.lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return false;
    if (!fs.existsSync(filename)) return true;
    const fileStat = fs.lstatSync(filename);
    return fileStat.isFile() && !fileStat.isSymbolicLink();
  } catch {
    return false;
  }
}

function assertPrivexControlledPayment(config, source = {}) {
  const issues = [];
  const host = normalizePublicHost(source.HIVE_BAR_HOST);
  if (config.env !== 'production') issues.push('NODE_ENV must be production');
  if (host !== RELEASE_PUBLIC_HOST) issues.push('HIVE_BAR_HOST must be fourthstreetbar.com');
  if (config.auth.appOrigin !== `https://${RELEASE_PUBLIC_HOST}`) issues.push('APP_ORIGIN must be the canonical HTTPS host');
  if (config.server.bindHost !== '127.0.0.1' || config.server.port !== 3000 || config.server.trustProxy !== 'loopback') issues.push('the approved loopback and proxy topology changed');
  if (config.hive.writeMode !== 'controlled') issues.push('HIVE_WRITE_MODE must be controlled');
  if (config.hive.controlledAccounts.length !== 1) issues.push('exactly one verified payer account must be controlled');
  if (config.hive.controlledActions.length !== 1 || config.hive.controlledActions[0] !== 'payment') issues.push('only the payment action may be controlled');
  if (config.hive.signerMode !== 'keychain') issues.push('HIVE_SIGNER_MODE must be keychain');
  if (!config.payments.enabled) issues.push('the payment configuration must be enabled by the exact controlled-payment settings');
  if (config.payments.merchantAccounts.length !== 1 || config.payments.merchantAccounts[0] !== 'fourthstreetbar') issues.push('the only payment merchant must be @fourthstreetbar');
  if (config.payments.maxHbd !== '1.000 HBD') issues.push('HIVE_PAYMENT_MAX_HBD must be exactly 1.000 HBD');
  if (!isSafePaymentDatabasePath(config.payments.receiptDbPath)) issues.push(`HIVE_PAYMENT_RECEIPT_DB_PATH must be exactly ${PAYMENT_DB_PATH} with no symlink target`);
  if (config.distriator.enabled) issues.push('Distriator must remain disabled for the initial M14 payment profile');
  if (config.hive.m9PilotControlPath || config.hive.m10OperatorArmedUntil || config.hive.m10OperatorAuditPath) issues.push('M9/M10 posting-control state must be absent');
  if (config.hive.m12MerchantAuthor || config.hive.m12AuthorizedSigners.length) issues.push('M12 delegated-posting state must be absent');
  if (config.hive.rpcNodes.length < 3) issues.push('at least three Hive RPC nodes are required');
  if (issues.length > 0) throw new Error(`M14 controlled payment gate failed: ${issues.join('; ')}`);
  return Object.freeze({
    profile: 'm14-controlled-payment',
    payer: config.hive.controlledAccounts[0],
    merchant: 'fourthstreetbar',
    action: 'payment',
    authority: 'Active',
    signer: 'keychain',
    maxHbd: config.payments.maxHbd,
    receiptDatabase: config.payments.receiptDbPath,
    irreversibleConfirmation: true,
    distriatorEnabled: false,
    rpcNodeCount: config.hive.rpcNodes.length,
  });
}

module.exports = { PAYMENT_DB_PATH, assertPrivexControlledPayment, isSafePaymentDatabasePath };
