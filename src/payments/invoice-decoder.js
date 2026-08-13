'use strict';

const hiveUri = require('hive-uri');
const { requireHiveAccount } = require('../http/validation');
const { ValidationError } = require('../lib/errors');
const { parseAsset } = require('../hive/assets');
const { fingerprint } = require('../hive/social-operations');

const MAX_INVOICE_BYTES = 16 * 1024;
const MAX_MEMO_BYTES = 2048;
const TRANSFER_KEYS = Object.freeze(['amount', 'from', 'memo', 'to']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function canonicalAccount(value, label) {
  const raw = String(value ?? '');
  const account = requireHiveAccount(raw, label);
  if (raw !== account) throw new ValidationError(`${label} must use its canonical lowercase form`);
  return account;
}

function requireInvoiceText(value) {
  const invoice = String(value ?? '').trim();
  if (!invoice) throw new ValidationError('A Hive payment URI is required');
  if (Buffer.byteLength(invoice, 'utf8') > MAX_INVOICE_BYTES) {
    throw new ValidationError(
      `The Hive payment URI must be ${MAX_INVOICE_BYTES.toLocaleString('en-US')} UTF-8 bytes or fewer`,
    );
  }
  if (/[\u0000-\u001F\u007F]/.test(invoice)) {
    throw new ValidationError('The Hive payment URI contains invalid control characters');
  }
  return invoice;
}

function decodeLibraryUri(invoice) {
  try {
    return hiveUri.decode(invoice);
  } catch {
    throw new ValidationError('The Hive payment URI is malformed or unsupported');
  }
}

function resolveLibraryTransaction(decoded, account) {
  try {
    return hiveUri.resolveTransaction(decoded.tx, decoded.params || {}, {
      ref_block_num: 0,
      ref_block_prefix: 0,
      expiration: '1970-01-01T00:00:00',
      signers: [account],
      preferred_signer: account,
    }).tx;
  } catch {
    throw new ValidationError('The Hive payment URI signer does not match the verified account');
  }
}

function requireExactTransfer(tx) {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx) || !Array.isArray(tx.operations)) {
    throw new ValidationError('The Hive payment URI does not contain a transaction');
  }
  if (tx.operations.length !== 1) {
    throw new ValidationError('A Hive-Bar invoice must contain exactly one operation');
  }
  const operation = tx.operations[0];
  if (!Array.isArray(operation) || operation.length !== 2 || operation[0] !== 'transfer') {
    throw new ValidationError('A Hive-Bar invoice must contain exactly one transfer operation');
  }
  const value = operation[1];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new ValidationError('The Hive transfer payload is invalid');
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(TRANSFER_KEYS)) {
    throw new ValidationError('The Hive transfer payload contains missing or unsupported fields');
  }
  return value;
}

function decodeHivePaymentInvoice(uri, { account: accountValue, merchantAccounts, maxHbd }) {
  const account = requireHiveAccount(accountValue, 'Verified payer account');
  const merchants = new Set(
    (Array.isArray(merchantAccounts) ? merchantAccounts : []).map((merchant) =>
      requireHiveAccount(merchant, 'Configured merchant account'),
    ),
  );
  if (merchants.size === 0) {
    throw new ValidationError('The Pay Tab merchant allowlist is not configured');
  }
  const maximum = parseAsset(maxHbd, 'HBD');
  if (!maximum || maximum.canonical !== maxHbd || maximum.units <= 0n) {
    throw new TypeError('M5 requires a canonical positive HBD maximum');
  }

  const invoice = requireInvoiceText(uri);
  const decoded = decodeLibraryUri(invoice);
  if (decoded.params?.no_broadcast) {
    throw new ValidationError('A no-broadcast URI cannot be used to pay a tab');
  }
  if (
    decoded.params?.authority &&
    String(decoded.params.authority).trim().toLowerCase() !== 'active'
  ) {
    throw new ValidationError('The Hive payment URI requests the wrong authority');
  }
  const tx = resolveLibraryTransaction(decoded, account);
  const transfer = requireExactTransfer(tx);
  const from = canonicalAccount(transfer.from, 'Transfer sender');
  const to = canonicalAccount(transfer.to, 'Transfer recipient');
  if (from !== account) {
    throw new ValidationError('The transfer sender does not match the verified account');
  }
  if (!merchants.has(to)) {
    throw new ValidationError('The transfer recipient is not an approved merchant account');
  }

  const amountText = String(transfer.amount ?? '');
  const amount = parseAsset(amountText, 'HBD');
  if (!amount || amount.canonical !== amountText || amount.units <= 0n) {
    throw new ValidationError('The transfer amount must be positive HBD with exactly three decimals');
  }
  if (amount.units > maximum.units) {
    throw new ValidationError(`The transfer amount exceeds the controlled maximum of ${maximum.canonical}`);
  }

  if (typeof transfer.memo !== 'string' || !transfer.memo) {
    throw new ValidationError('The transfer memo is required');
  }
  if (Buffer.byteLength(transfer.memo, 'utf8') > MAX_MEMO_BYTES) {
    throw new ValidationError(`The transfer memo must be ${MAX_MEMO_BYTES} UTF-8 bytes or fewer`);
  }

  const operations = [[
    'transfer',
    { from, to, amount: amount.canonical, memo: transfer.memo },
  ]];
  const envelope = {
    action: 'payment',
    account,
    authority: 'Active',
    operations,
    fingerprint: fingerprint(operations),
    summary: {
      kind: 'Verified Pay Tab transfer',
      payer: account,
      merchant: to,
      amount: amount.canonical,
      memo: transfer.memo,
      lifecycle: 'Keychain acceptance is pending only; Paid requires two-node chain confirmation',
    },
  };
  return deepFreeze(envelope);
}

module.exports = {
  MAX_INVOICE_BYTES,
  MAX_MEMO_BYTES,
  decodeHivePaymentInvoice,
  requireExactTransfer,
};
