'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const { ValidationError } = require('../lib/errors');

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map([...BASE58].map((character, index) => [character, BigInt(index)]));

function requireNewHiveAccountName(value) {
  const username = String(value || '').trim();
  if (username !== username.toLowerCase() || username.length < 3 || username.length > 16) {
    throw new ValidationError('Hive username must be 3–16 lowercase characters');
  }
  const labels = username.split('.');
  if (labels.some((label) => label.length < 3)) {
    throw new ValidationError('Each part of a Hive username must be at least 3 characters');
  }
  for (const label of labels) {
    if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(label)) {
      throw new ValidationError('Hive username parts must start with a letter and end with a letter or number');
    }
  }
  return username;
}

function decodeBase58(value) {
  if (!value) return Buffer.alloc(0);
  let number = 0n;
  for (const character of value) {
    const digit = BASE58_INDEX.get(character);
    if (digit === undefined) throw new ValidationError('Hive public key is invalid');
    number = number * 58n + digit;
  }

  const bytes = [];
  while (number > 0n) {
    bytes.push(Number(number & 0xffn));
    number >>= 8n;
  }
  bytes.reverse();

  let leadingZeros = 0;
  while (value[leadingZeros] === '1') leadingZeros += 1;
  return Buffer.concat([Buffer.alloc(leadingZeros), Buffer.from(bytes)]);
}

function requireHivePublicKey(value, label = 'Hive public key') {
  const text = String(value || '').trim();
  if (!text.startsWith('STM')) throw new ValidationError(`${label} is invalid`);
  const decoded = decodeBase58(text.slice(3));
  if (decoded.length !== 37) throw new ValidationError(`${label} is invalid`);
  const keyBytes = decoded.subarray(0, 33);
  const checksum = decoded.subarray(33);
  if (![2, 3].includes(keyBytes[0])) throw new ValidationError(`${label} is invalid`);
  const expected = createHash('ripemd160').update(keyBytes).digest().subarray(0, 4);
  if (!timingSafeEqual(checksum, expected)) throw new ValidationError(`${label} checksum is invalid`);
  return text;
}

function requirePublicKeySet(value) {
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowed = new Set(['owner', 'active', 'posting', 'memo']);
  for (const key of Object.keys(keys)) {
    if (!allowed.has(key)) throw new ValidationError('Only Hive public keys may be submitted');
  }
  return Object.freeze({
    owner: requireHivePublicKey(keys.owner, 'Owner public key'),
    active: requireHivePublicKey(keys.active, 'Active public key'),
    posting: requireHivePublicKey(keys.posting, 'Posting public key'),
    memo: requireHivePublicKey(keys.memo, 'Memo public key'),
  });
}

module.exports = { requireHivePublicKey, requireNewHiveAccountName, requirePublicKeySet };
