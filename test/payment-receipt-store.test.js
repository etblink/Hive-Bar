'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const hiveUri = require('hive-uri');
const { decodeHivePaymentInvoice } = require('../src/payments/invoice-decoder');
const { RECEIPT_STATES, ReceiptStore } = require('../src/payments/receipt-store');

function envelope(memo = 'v4v-pos:tab-123', amount = '0.001 HBD') {
  return decodeHivePaymentInvoice(
    hiveUri.encodeOp([
      'transfer',
      { from: '__signer', to: 'fourthstreetbar', amount, memo },
    ], { signer: 'etblink', authority: 'active' }),
    { account: 'etblink', merchantAccounts: ['fourthstreetbar'], maxHbd: '1.000 HBD' },
  );
}

test('persists the strict payment lifecycle, restart recovery, and confirmed receipt fields', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hive-bar-receipts-'));
  const filename = path.join(directory, 'receipts.sqlite');
  let now = Date.parse('2026-08-13T08:00:00Z');
  let store = new ReceiptStore({ filename, now: () => now, random: () => 'receipt-1' });
  try {
    let receipt = store.createValidated({ sessionId: 'session-1', envelope: envelope() });
    assert.equal(receipt.state, RECEIPT_STATES.VALIDATED);
    assert.equal(receipt.amount, '0.001 HBD');
    assert.throws(
      () => store.createValidated({ sessionId: 'session-1', envelope: envelope() }),
      (error) => error.code === 'DUPLICATE_PAYMENT',
    );
    assert.throws(() => store.get(receipt.id, 'session-2', 'intruder'), /belongs to another verified account/);

    receipt = store.markAwaitingSignature(receipt.id, 'session-1');
    assert.equal(receipt.state, RECEIPT_STATES.AWAITING_SIGNATURE);
    now += 1000;
    receipt = store.markBroadcastAccepted(receipt.id, 'session-1', 'a'.repeat(40));
    assert.equal(receipt.state, RECEIPT_STATES.BROADCAST_ACCEPTED);
    store.close();

    store = new ReceiptStore({ filename, now: () => now });
    receipt = store.latest('session-after-restart', 'etblink');
    assert.equal(receipt.transactionId, 'a'.repeat(40));
    assert.equal(receipt.state, RECEIPT_STATES.BROADCAST_ACCEPTED);
    receipt = store.applyObservation(receipt.id, 'session-1', {
      status: 'pending',
      diagnostic: 'one node only',
    });
    assert.equal(receipt.state, RECEIPT_STATES.BROADCAST_ACCEPTED);
    assert.equal(receipt.observationChecks, 1);
    receipt = store.markConfirmationTimeout(receipt.id, 'session-1');
    assert.equal(receipt.state, RECEIPT_STATES.CONFIRMATION_TIMEOUT);
    receipt = store.applyObservation(receipt.id, 'session-1', {
      status: 'confirmed',
      blockNumber: 109000000,
      transactionIndex: 3,
      chainTimestamp: '2026-08-13T08:00:05',
    });
    assert.equal(receipt.state, RECEIPT_STATES.CHAIN_CONFIRMED);
    assert.equal(receipt.blockNumber, 109000000);
    assert.equal(receipt.transactionIndex, 3);
    assert.equal(receipt.observationChecks, 2);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('cancellation is pre-broadcast only and releases the invoice fingerprint', () => {
  const store = new ReceiptStore({ random: (() => {
    let value = 0;
    return () => `receipt-${++value}`;
  })() });
  try {
    const first = store.createValidated({ sessionId: 'session-1', envelope: envelope() });
    assert.equal(store.cancel(first.id, 'session-1').state, RECEIPT_STATES.CANCELLED);
    const second = store.createValidated({ sessionId: 'session-1', envelope: envelope() });
    store.markAwaitingSignature(second.id, 'session-1');
    store.markBroadcastAccepted(second.id, 'session-1', null);
    assert.throws(
      () => store.cancel(second.id, 'session-1'),
      (error) => error.code === 'PAYMENT_NOT_CANCELLABLE',
    );
    assert.equal(store.get(second.id, 'session-1').transactionId, null);
  } finally {
    store.close();
  }
});

test('enforces transaction idempotency and legal compare-and-set transitions', () => {
  const store = new ReceiptStore({ random: (() => {
    let value = 0;
    return () => `receipt-${++value}`;
  })() });
  try {
    const first = store.createValidated({ sessionId: 'session-1', envelope: envelope('memo-1') });
    assert.throws(
      () => store.markBroadcastAccepted(first.id, 'session-1', 'a'.repeat(40)),
      (error) => error.code === 'PAYMENT_REVIEW_REQUIRED',
    );
    store.markAwaitingSignature(first.id, 'session-1');
    store.markBroadcastAccepted(first.id, 'session-1', 'a'.repeat(40));

    const second = store.createValidated({ sessionId: 'session-1', envelope: envelope('memo-2') });
    store.markAwaitingSignature(second.id, 'session-1');
    assert.throws(
      () => store.markBroadcastAccepted(second.id, 'session-1', 'a'.repeat(40)),
      (error) => error.code === 'DUPLICATE_TRANSACTION',
    );
    assert.throws(
      () => store.applyObservation(second.id, 'session-1', { status: 'pending' }),
      (error) => error.code === 'BROADCAST_ACCEPTANCE_REQUIRED',
    );
  } finally {
    store.close();
  }
});
