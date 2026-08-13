'use strict';

const { ValidationError } = require('../lib/errors');
const { isUnknownTransaction, operationEquivalent } = require('../hive/read-service');
const { TRANSACTION_ID_PATTERN } = require('./receipt-store');

function inspectTransaction(transaction, receipt) {
  if (!transaction) return { status: 'missing' };
  const actual = Array.isArray(transaction.operations) ? transaction.operations : [];
  const expected = Array.isArray(receipt.operations) ? receipt.operations : [];
  const exact =
    String(transaction.transaction_id || '').toLowerCase() === receipt.transactionId &&
    actual.length === expected.length &&
    expected.every((operation, index) => operationEquivalent(operation, actual[index]));
  if (!exact) return { status: 'mismatch' };
  if (!Number.isSafeInteger(transaction.block_num) || transaction.block_num <= 0) {
    return { status: 'mismatch' };
  }
  return {
    status: 'matched',
    blockNumber: transaction.block_num,
    transactionIndex: Number.isSafeInteger(transaction.transaction_num)
      ? transaction.transaction_num
      : null,
    chainTimestamp: typeof transaction.timestamp === 'string' ? transaction.timestamp : null,
  };
}

class PaymentObserver {
  constructor({ rpcPool, nodeUrls }) {
    if (!rpcPool || typeof rpcPool.callNode !== 'function') {
      throw new TypeError('PaymentObserver requires independent RPC-node access');
    }
    this.rpcPool = rpcPool;
    this.nodeUrls = [...new Set(nodeUrls || [])];
    if (this.nodeUrls.length < 2) {
      throw new TypeError('PaymentObserver requires at least two independent Hive RPC nodes');
    }
  }

  async observe(receipt) {
    if (!TRANSACTION_ID_PATTERN.test(String(receipt?.transactionId || ''))) {
      throw new ValidationError('A valid transaction id is required before confirmation');
    }
    const results = await Promise.all(
      this.nodeUrls.map(async (nodeUrl) => {
        try {
          const transaction = await this.rpcPool.callNode(
            nodeUrl,
            'account_history_api',
            'get_transaction',
            { id: receipt.transactionId, include_reversible: true },
            { acceptRpcError: (error) => isUnknownTransaction(error, receipt.transactionId) },
          );
          return { nodeUrl, ...inspectTransaction(transaction, receipt) };
        } catch {
          return { nodeUrl, status: 'error' };
        }
      }),
    );

    const mismatches = results.filter((result) => result.status === 'mismatch');
    const matches = results.filter((result) => result.status === 'matched');
    const locations = new Set(
      matches.map(
        (result) =>
          `${result.blockNumber}:${result.transactionIndex ?? ''}:${result.chainTimestamp ?? ''}`,
      ),
    );
    if (mismatches.length > 0 || locations.size > 1) {
      return {
        status: 'disagreement',
        diagnostic: 'Hive nodes disagree about the exact payment; it remains pending and must not be retried',
        corroborations: matches.length,
      };
    }
    if (matches.length >= 2) {
      const observation = matches[0];
      return {
        status: 'confirmed',
        diagnostic: null,
        blockNumber: observation.blockNumber,
        transactionIndex: observation.transactionIndex,
        chainTimestamp: observation.chainTimestamp,
        corroborations: matches.length,
      };
    }
    return {
      status: 'pending',
      diagnostic: `Exact payment observed by ${matches.length} of ${results.length} configured nodes; awaiting independent corroboration`,
      corroborations: matches.length,
    };
  }
}

module.exports = { PaymentObserver, inspectTransaction };
