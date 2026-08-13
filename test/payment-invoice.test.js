'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const hiveUri = require('hive-uri');
const {
  MAX_INVOICE_BYTES,
  decodeHivePaymentInvoice,
} = require('../src/payments/invoice-decoder');

const options = {
  account: 'etblink',
  merchantAccounts: ['fourthstreetbar'],
  maxHbd: '1.000 HBD',
};
const v4vBlankPayerInvoice = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'payments', 'v4v-hbd-blank-payer.txt'),
  'utf8',
).trim();

function transfer(overrides = {}) {
  return [
    'transfer',
    {
      from: '__signer',
      to: 'fourthstreetbar',
      amount: '0.001 HBD',
      memo: 'v4v-pos:tab-123',
      ...overrides,
    },
  ];
}

function specializedMemo(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '.');
}

test('decodes both required Hive URI forms through the pinned library and freezes one exact transfer', () => {
  const specialized = `hive://sign/transfer/fourthstreetbar/0.001%20HBD/${specializedMemo('v4v-pos:tab-123')}?s=etblink&a=active`;
  const encoded = hiveUri.encodeOp(transfer(), {
    signer: 'etblink',
    authority: 'active',
    callback: 'https://attacker.example/ignored',
  });

  for (const uri of [specialized, encoded]) {
    const envelope = decodeHivePaymentInvoice(uri, options);
    assert.equal(envelope.account, 'etblink');
    assert.equal(envelope.authority, 'Active');
    assert.deepEqual(envelope.operations, [[
      'transfer',
      {
        from: 'etblink',
        to: 'fourthstreetbar',
        amount: '0.001 HBD',
        memo: 'v4v-pos:tab-123',
      },
    ]]);
    assert.match(envelope.fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(Object.isFrozen(envelope), true);
    assert.equal(Object.isFrozen(envelope.operations[0][1]), true);
    assert.doesNotMatch(JSON.stringify(envelope), /attacker\.example/);
  }
});

test('binds the current V4V empty payer placeholder only to the verified session account', () => {
  const envelope = decodeHivePaymentInvoice(v4vBlankPayerInvoice, options);

  assert.equal(envelope.account, 'etblink');
  assert.equal(envelope.authority, 'Active');
  assert.deepEqual(envelope.operations, [[
    'transfer',
    {
      from: 'etblink',
      to: 'fourthstreetbar',
      amount: '0.100 HBD',
      memo: 'v4v-captured-format',
    },
  ]]);
  assert.equal(
    envelope.fingerprint,
    'cdb61a94af3c79333086d3d605d19a326a2fb342b7d7ccd9f61e0375e21975d0',
  );
  assert.equal(Object.isFrozen(envelope.operations[0][1]), true);
});

test('rejects the deterministic negative invoice corpus closed', () => {
  const polluted = JSON.parse(
    '{"from":"__signer","to":"fourthstreetbar","amount":"0.001 HBD","memo":"memo","__proto__":{"polluted":true}}',
  );
  const cases = [
    ['', /required/],
    ['https://example.com/pay', /malformed or unsupported/],
    ['lightning:lnurl1deterministicfixture', /Lightning invoice.*hive:\/\//],
    ['hive://sign/op/%%%', /malformed or unsupported/],
    ['hive://sign/op/abc\ndef', /invalid control characters/],
    [`hive://sign/op/${'_w..'}`, /malformed or unsupported/],
    [hiveUri.encodeOps([transfer(), transfer({ memo: 'other' })]), /exactly one operation/],
    [hiveUri.encodeOp(['vote', {}]), /transfer operation/],
    [hiveUri.encodeOp(transfer({ from: 'intruder' })), /sender does not match/],
    [hiveUri.encodeOp(transfer({ from: ' ' })), /sender is invalid/],
    [hiveUri.encodeOp(transfer({ to: 'othermerchant' })), /not an approved merchant/],
    [hiveUri.encodeOp(transfer({ amount: '0.001 HIVE' })), /positive HBD/],
    [hiveUri.encodeOp(transfer({ amount: '0.000 HBD' })), /positive HBD/],
    [hiveUri.encodeOp(transfer({ amount: '-0.001 HBD' })), /positive HBD/],
    [hiveUri.encodeOp(transfer({ amount: '0.0001 HBD' })), /positive HBD/],
    [hiveUri.encodeOp(transfer({ amount: '1.001 HBD' })), /exceeds/],
    [hiveUri.encodeOp(transfer({ memo: '' })), /memo is required/],
    [hiveUri.encodeOp(['transfer', { ...transfer()[1], unexpected: true }]), /unsupported fields/],
    [hiveUri.encodeOp(['transfer', polluted]), /transfer payload is invalid/],
    [hiveUri.encodeOp(transfer(), { signer: 'intruder' }), /signer does not match/],
    [hiveUri.encodeOp(transfer(), { no_broadcast: true }), /no-broadcast/],
    [hiveUri.encodeOp(transfer(), { authority: 'posting' }), /wrong authority/],
    [`hive://sign/transfer/fourthstreetbar/0.001%20HBD/${specializedMemo('')}`, /malformed|memo/],
    ['x'.repeat(MAX_INVOICE_BYTES + 1), /16,384 UTF-8 bytes or fewer/],
  ];

  for (const [uri, expected] of cases) {
    assert.throws(() => decodeHivePaymentInvoice(uri, options), expected, String(uri).slice(0, 80));
  }
});

test('requires canonical accounts and a configured merchant allowlist', () => {
  assert.throws(
    () => decodeHivePaymentInvoice(hiveUri.encodeOp(transfer({ to: 'FourthStreetBar' })), options),
    /canonical lowercase form/,
  );
  assert.throws(
    () => decodeHivePaymentInvoice(hiveUri.encodeOp(transfer()), { ...options, merchantAccounts: [] }),
    /merchant allowlist is not configured/,
  );
});
