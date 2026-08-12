'use strict';

const { requireHiveAccount } = require('../http/validation');
const { ValidationError } = require('../lib/errors');
const { parseAsset } = require('./assets');

const HISTORY_PAGE_SIZE = 25;
const INBOX_INNER_MARKER = 'hivebar-inbox:v1:';
const INBOX_MEMO_MARKER = 'hivebar-inbox:v1:';
const MEMO_MAX_BYTES = 2048;
const TRANSFER_OPERATION_FILTER = 4;
const WALL_MEMO_MARKER = 'hivebar-wall:v1:';

function utf8Bytes(value) {
  return Buffer.byteLength(String(value), 'utf8');
}

function encodeHistoryCursor(before) {
  return Buffer.from(JSON.stringify({ before }), 'utf8').toString('base64url');
}

function parseHistoryCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  const encoded = String(value).trim();
  if (encoded.length > 128 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new ValidationError('Message pagination cursor is invalid');
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Message pagination cursor is invalid');
  }
  if (!parsed || !Number.isSafeInteger(parsed.before) || parsed.before < 0) {
    throw new ValidationError('Message pagination cursor is invalid');
  }
  return parsed.before;
}

function requireMessageText(value, label = 'Message') {
  const text = String(value ?? '').trim();
  if (!text) throw new ValidationError(`${label} is required`);
  return text;
}

function buildWallMemo(value) {
  const text = requireMessageText(value, 'Wall message');
  const memo = `${WALL_MEMO_MARKER}${text}`;
  if (utf8Bytes(memo) >= MEMO_MAX_BYTES) {
    throw new ValidationError(`Wall message memo must be fewer than ${MEMO_MAX_BYTES} UTF-8 bytes`);
  }
  return memo;
}

function requireCiphertext(value) {
  const ciphertext = String(value ?? '').trim();
  if (!ciphertext.startsWith('#') || ciphertext.length < 10 || /[\r\n]/.test(ciphertext)) {
    throw new ValidationError('Inbox ciphertext is invalid');
  }
  const memo = `${INBOX_MEMO_MARKER}${ciphertext}`;
  if (utf8Bytes(memo) >= MEMO_MAX_BYTES) {
    throw new ValidationError(`Encrypted inbox memo must be fewer than ${MEMO_MAX_BYTES} UTF-8 bytes`);
  }
  return ciphertext;
}

function buildInboxMemo(value) {
  return `${INBOX_MEMO_MARKER}${requireCiphertext(value)}`;
}

function operationTuple(value) {
  if (Array.isArray(value) && value.length === 2) return value;
  if (value && typeof value === 'object' && typeof value.type === 'string') {
    return [value.type.replace(/_operation$/, ''), value.value || {}];
  }
  return [null, null];
}

function normalizeHistoryEntry(raw) {
  if (!Array.isArray(raw) || raw.length !== 2 || !Number.isSafeInteger(raw[0])) return null;
  const event = raw[1];
  const [type, value] = operationTuple(event?.op);
  if (type !== 'transfer' || !value || typeof value !== 'object') return null;
  return {
    historyIndex: raw[0],
    transactionId: typeof event.trx_id === 'string' ? event.trx_id : '',
    blockNumber: Number.isSafeInteger(event.block) ? event.block : null,
    timestamp: typeof event.timestamp === 'string' ? event.timestamp : '',
    from: typeof value.from === 'string' ? value.from.toLowerCase() : '',
    to: typeof value.to === 'string' ? value.to.toLowerCase() : '',
    amount: value.amount,
    memo: typeof value.memo === 'string' ? value.memo : '',
  };
}

function exclusionSet(globalExclusions = [], profileExclusions = []) {
  return new Set(
    [...globalExclusions, ...profileExclusions].map((account) =>
      String(account || '').trim().toLowerCase(),
    ),
  );
}

function qualifyingInboundTransfer(entry, { recipient, minimumFee, excludedSenders }) {
  if (!entry || entry.to !== recipient || excludedSenders.has(entry.from)) return null;
  const amount = parseAsset(entry.amount, 'HBD');
  const threshold = parseAsset(minimumFee, 'HBD');
  if (!amount || !threshold || amount.units < threshold.units) return null;
  return { amount, threshold };
}

function classifyWallEntry(raw, options) {
  const entry = normalizeHistoryEntry(raw);
  const qualified = qualifyingInboundTransfer(entry, options);
  if (!qualified || !entry.memo.startsWith(WALL_MEMO_MARKER) || entry.memo.startsWith('#')) return null;
  const message = entry.memo.slice(WALL_MEMO_MARKER.length).trim();
  if (!message) return null;
  return {
    sender: entry.from,
    recipient: entry.to,
    amount: qualified.amount.canonical,
    message,
    timestamp: entry.timestamp,
    transactionId: entry.transactionId,
    blockNumber: entry.blockNumber,
    historyIndex: entry.historyIndex,
  };
}

function classifyInboxEntry(raw, options) {
  const entry = normalizeHistoryEntry(raw);
  const qualified = qualifyingInboundTransfer(entry, options);
  if (!qualified || !entry.memo.startsWith(INBOX_MEMO_MARKER)) return null;
  const ciphertext = entry.memo.slice(INBOX_MEMO_MARKER.length);
  if (!ciphertext.startsWith('#')) return null;
  return {
    sender: entry.from,
    recipient: entry.to,
    amount: qualified.amount.canonical,
    ciphertext,
    timestamp: entry.timestamp,
    transactionId: entry.transactionId,
    blockNumber: entry.blockNumber,
    historyIndex: entry.historyIndex,
  };
}

function createMessagePage(rawHistory, {
  account,
  minimumFee,
  globalExclusions = [],
  profileExclusions = [],
  kind,
  pageSize = HISTORY_PAGE_SIZE,
}) {
  const recipient = requireHiveAccount(account);
  const history = Array.isArray(rawHistory) ? rawHistory : [];
  const excludedSenders = exclusionSet(globalExclusions, profileExclusions);
  const classify = kind === 'inbox' ? classifyInboxEntry : classifyWallEntry;
  const items = history
    .map((raw) => classify(raw, { recipient, minimumFee, excludedSenders }))
    .filter(Boolean)
    .sort((left, right) => right.historyIndex - left.historyIndex);
  const validIndexes = history
    .map((raw) => (Array.isArray(raw) && Number.isSafeInteger(raw[0]) ? raw[0] : null))
    .filter((index) => index !== null);
  const oldest = validIndexes.length > 0 ? Math.min(...validIndexes) : null;
  const hasNextPage = history.length >= pageSize && oldest !== null && oldest > 0;
  return {
    items,
    nextCursor: hasNextPage ? encodeHistoryCursor(oldest - 1) : null,
  };
}

module.exports = {
  HISTORY_PAGE_SIZE,
  INBOX_INNER_MARKER,
  INBOX_MEMO_MARKER,
  MEMO_MAX_BYTES,
  TRANSFER_OPERATION_FILTER,
  WALL_MEMO_MARKER,
  buildInboxMemo,
  buildWallMemo,
  classifyInboxEntry,
  classifyWallEntry,
  createMessagePage,
  encodeHistoryCursor,
  exclusionSet,
  normalizeHistoryEntry,
  parseHistoryCursor,
  requireCiphertext,
};
