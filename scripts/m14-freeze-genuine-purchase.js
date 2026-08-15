'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { decodeHivePaymentInvoice } = require('../src/payments/invoice-decoder');
const { fingerprint } = require('../src/hive/social-operations');
const { parseAsset } = require('../src/hive/assets');

const SCHEMA = 'hive-bar-m14.4-genuine-purchase-preparation/v1';
const STATUS = 'PREPARED_NO_KEYCHAIN_AUTHORIZATION';
const MERCHANT = 'fourthstreetbar';
const MAX_HBD = '1.000 HBD';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function requireSha(value, label) {
  const normalized = String(value || '').trim();
  if (!SHA_PATTERN.test(normalized)) throw new Error(`${label} must be a full lowercase 40-character Git SHA`);
  return normalized;
}

function requireIsoInstant(value) {
  const text = String(value || '').trim();
  const milliseconds = Date.parse(text);
  if (!text || !Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== text) {
    throw new Error('createdAt must be an exact UTC ISO-8601 instant');
  }
  return text;
}

function buildFrozenRecord({ uri, payer, acceptedCommit, acceptedTree, createdAt = new Date().toISOString() }) {
  const commit = requireSha(acceptedCommit, 'acceptedCommit');
  const tree = requireSha(acceptedTree, 'acceptedTree');
  const invoice = String(uri || '').trim();
  const envelope = decodeHivePaymentInvoice(invoice, {
    account: payer,
    merchantAccounts: [MERCHANT],
    maxHbd: MAX_HBD,
  });
  const [[operationName, transfer]] = envelope.operations;
  if (operationName !== 'transfer') throw new Error('M14.4 requires exactly one transfer operation');

  const base = {
    schema: SCHEMA,
    milestone: 'M14.4',
    status: STATUS,
    createdAt: requireIsoInstant(createdAt),
    acceptedCommit: commit,
    acceptedTree: tree,
    invoiceSha256: sha256(invoice),
    action: 'payment',
    payer: envelope.account,
    merchant: transfer.to,
    amount: transfer.amount,
    memo: transfer.memo,
    authority: envelope.authority,
    operations: envelope.operations,
    operationFingerprint: envelope.fingerprint,
    distriatorEnabled: false,
    keychainRequestAuthorized: false,
    broadcastAuthorized: false,
    retryAuthorized: false,
  };
  return Object.freeze({ ...base, bindingSha256: sha256(stableStringify(base)) });
}

function verifyFrozenRecord(record, { expectedCommit, expectedTree } = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('frozen record must be a JSON object');
  if (record.schema !== SCHEMA) throw new Error('unsupported M14.4 frozen-record schema');
  if (record.milestone !== 'M14.4' || record.status !== STATUS) throw new Error('record is not an unconsumed M14.4 preparation');
  requireIsoInstant(record.createdAt);
  const commit = requireSha(record.acceptedCommit, 'record acceptedCommit');
  const tree = requireSha(record.acceptedTree, 'record acceptedTree');
  if (expectedCommit && commit !== requireSha(expectedCommit, 'expectedCommit')) throw new Error('record commit does not match the active accepted release');
  if (expectedTree && tree !== requireSha(expectedTree, 'expectedTree')) throw new Error('record tree does not match the active accepted release');
  if (!DIGEST_PATTERN.test(String(record.invoiceSha256 || ''))) throw new Error('invoiceSha256 must be a lowercase SHA-256 digest');
  if (record.action !== 'payment') throw new Error('record action must be payment');
  if (record.payer !== 'etblink') throw new Error('M14.4 payer must be etblink');
  if (record.merchant !== MERCHANT) throw new Error('M14.4 merchant must be fourthstreetbar');
  if (record.authority !== 'Active') throw new Error('M14.4 authority must be Active');
  if (record.distriatorEnabled !== false) throw new Error('Distriator must remain disabled');
  if (record.keychainRequestAuthorized !== false || record.broadcastAuthorized !== false || record.retryAuthorized !== false) {
    throw new Error('the M14.4 preparation record must not authorize Keychain, broadcast, or retry');
  }

  if (!Array.isArray(record.operations) || record.operations.length !== 1) throw new Error('record must contain exactly one operation');
  const [name, transfer] = record.operations[0] || [];
  if (name !== 'transfer' || !transfer || typeof transfer !== 'object' || Array.isArray(transfer)) {
    throw new Error('record must contain exactly one transfer');
  }
  if (transfer.from !== record.payer || transfer.to !== record.merchant || transfer.amount !== record.amount || transfer.memo !== record.memo) {
    throw new Error('record summary does not exactly match its transfer operation');
  }
  const amount = parseAsset(record.amount, 'HBD');
  const maximum = parseAsset(MAX_HBD, 'HBD');
  if (!amount || amount.canonical !== record.amount || amount.units <= 0n || amount.units > maximum.units) {
    throw new Error(`record amount must be positive canonical HBD no greater than ${MAX_HBD}`);
  }
  if (typeof record.memo !== 'string' || !record.memo) throw new Error('record memo must be present');
  const expectedFingerprint = fingerprint(record.operations);
  if (record.operationFingerprint !== expectedFingerprint) throw new Error('operation fingerprint does not match the frozen operation');

  const { bindingSha256, ...base } = record;
  if (!DIGEST_PATTERN.test(String(bindingSha256 || ''))) throw new Error('bindingSha256 must be a lowercase SHA-256 digest');
  const expectedBinding = sha256(stableStringify(base));
  if (bindingSha256 !== expectedBinding) throw new Error('bindingSha256 does not match the frozen record');

  return Object.freeze({
    schema: record.schema,
    status: record.status,
    acceptedCommit: commit,
    acceptedTree: tree,
    payer: record.payer,
    merchant: record.merchant,
    amount: record.amount,
    authority: record.authority,
    operationFingerprint: record.operationFingerprint,
    bindingSha256: record.bindingSha256,
    distriatorEnabled: false,
    keychainRequestAuthorized: false,
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    if (options[key] !== undefined) throw new Error(`duplicate argument: ${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function readText(filename) {
  if (filename === '-') return fs.readFileSync(0, 'utf8');
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`input must be a regular non-symlink file: ${filename}`);
  return fs.readFileSync(filename, 'utf8');
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options['--verify-file']) {
    const record = JSON.parse(readText(options['--verify-file']));
    const summary = verifyFrozenRecord(record, {
      expectedCommit: options['--commit'],
      expectedTree: options['--tree'],
    });
    process.stdout.write(`M14_4_FROZEN_RECORD_VERIFY=PASS\n`);
    process.stdout.write(`M14_4_BINDING_SHA256=${summary.bindingSha256}\n`);
    process.stdout.write(`M14_4_OPERATION_FINGERPRINT=${summary.operationFingerprint}\n`);
    process.stdout.write('M14_4_KEYCHAIN_REQUESTS=Not-performed\n');
    process.stdout.write('M14_4_HIVE_WRITES=Not-performed\n');
    return summary;
  }

  for (const required of ['--invoice-file', '--payer', '--commit', '--tree', '--output']) {
    if (!options[required]) throw new Error(`${required} is required`);
  }
  const output = path.resolve(options['--output']);
  if (fs.existsSync(output)) throw new Error(`refusing to overwrite existing frozen record: ${output}`);
  const record = buildFrozenRecord({
    uri: readText(options['--invoice-file']),
    payer: options['--payer'],
    acceptedCommit: options['--commit'],
    acceptedTree: options['--tree'],
    createdAt: options['--created-at'] || new Date().toISOString(),
  });
  fs.writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  process.stdout.write(`M14_4_FREEZE_STATUS=${record.status}\n`);
  process.stdout.write(`M14_4_ACCEPTED_COMMIT=${record.acceptedCommit}\n`);
  process.stdout.write(`M14_4_ACCEPTED_TREE=${record.acceptedTree}\n`);
  process.stdout.write(`M14_4_PAYER=${record.payer}\n`);
  process.stdout.write(`M14_4_MERCHANT=${record.merchant}\n`);
  process.stdout.write(`M14_4_AMOUNT=${record.amount}\n`);
  process.stdout.write(`M14_4_OPERATION_FINGERPRINT=${record.operationFingerprint}\n`);
  process.stdout.write(`M14_4_BINDING_SHA256=${record.bindingSha256}\n`);
  process.stdout.write('M14_4_KEYCHAIN_REQUESTS=Not-performed\n');
  process.stdout.write('M14_4_HIVE_WRITES=Not-performed\n');
  return record;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`M14_4_FREEZE_REFUSED: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  MAX_HBD,
  MERCHANT,
  SCHEMA,
  STATUS,
  buildFrozenRecord,
  main,
  sha256,
  stableStringify,
  verifyFrozenRecord,
};
