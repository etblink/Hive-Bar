'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { canonicalFromUnits, parseAsset } = require('../src/hive/assets');

test('parses canonical Hive assets without floating-point conversion', () => {
  assert.deepEqual(parseAsset('1.000 HBD', 'HBD'), {
    units: 1000n,
    precision: 3,
    symbol: 'HBD',
    canonical: '1.000 HBD',
  });
  assert.equal(canonicalFromUnits(1234567n, 6, 'VESTS'), '1.234567 VESTS');
  assert.equal(parseAsset('1.00 HBD', 'HBD'), null);
  assert.equal(parseAsset('01.000 HBD', 'HBD'), null);
  assert.equal(parseAsset('-1.000 HBD', 'HBD'), null);
  assert.equal(parseAsset('1.000 HIVE', 'HBD'), null);
});

test('normalizes AppBase NAI assets to canonical strings', () => {
  assert.deepEqual(
    parseAsset({ amount: '17', precision: 3, nai: '@@000000013' }, 'HBD'),
    { units: 17n, precision: 3, symbol: 'HBD', canonical: '0.017 HBD' },
  );
  assert.equal(parseAsset({ amount: '17', precision: 2, nai: '@@000000013' }, 'HBD'), null);
  assert.equal(parseAsset({ amount: '-1', precision: 3, nai: '@@000000013' }, 'HBD'), null);
});
