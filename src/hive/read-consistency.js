'use strict';

const { isDeepStrictEqual } = require('node:util');
const { requireHiveAccount, requirePermlink } = require('../http/validation');
const { negativeVoteCount, positiveVoteCount } = require('./normalizers');

const HARDENED = Symbol.for('hive-bar.read-consistency-hardening');
const TRANSACTION_ID_PATTERN = /^[0-9a-f]{40}$/i;

function operationTuple(operation) {
  if (Array.isArray(operation) && operation.length === 2) return operation;
  if (operation && typeof operation === 'object' && typeof operation.type === 'string') {
    return [operation.type.replace(/_operation$/, ''), operation.value || {}];
  }
  return [null, null];
}

function socialOperationEquivalent(expected, actual) {
  const [expectedType, expectedValue] = operationTuple(expected);
  const [actualType, actualValue] = operationTuple(actual);
  return Boolean(
    expectedType &&
    expectedType === actualType &&
    isDeepStrictEqual(expectedValue, actualValue)
  );
}

function exactTransactionObservation(record, transaction) {
  const transactionId = String(record?.transactionId || '').toLowerCase();
  const expected = Array.isArray(record?.operations) ? record.operations : [];
  const actual = Array.isArray(transaction?.operations) ? transaction.operations : [];
  const observed = Boolean(
    transactionId &&
    String(transaction?.transaction_id || '').toLowerCase() === transactionId &&
    expected.length === actual.length &&
    expected.every((operation, index) => socialOperationEquivalent(operation, actual[index]))
  );
  return {
    observed,
    blockNumber:
      observed && Number.isSafeInteger(transaction?.block_num) ? transaction.block_num : null,
  };
}

function applyReadConsistencyHardening(hiveReads) {
  if (!hiveReads || typeof hiveReads !== 'object') {
    throw new TypeError('Hive read consistency hardening requires a Hive read service');
  }
  if (hiveReads[HARDENED]) return hiveReads;
  if (
    typeof hiveReads.getPostWithComments !== 'function' ||
    typeof hiveReads.observeSocialOperation !== 'function' ||
    typeof hiveReads.getTransaction !== 'function' ||
    !hiveReads.rpcPool ||
    typeof hiveReads.rpcPool.call !== 'function'
  ) {
    throw new TypeError('Hive read service is missing required observation methods');
  }

  const originalGetPostWithComments = hiveReads.getPostWithComments.bind(hiveReads);
  const originalObserveSocialOperation = hiveReads.observeSocialOperation.bind(hiveReads);

  hiveReads.getPostWithComments = async (authorValue, permlinkValue) => {
    const discussion = await originalGetPostWithComments(authorValue, permlinkValue);
    const post = discussion?.post;
    if (!post?.author || !post?.permlink) return discussion;

    try {
      const activeVotes = await hiveReads.rpcPool.call('condenser_api', 'get_active_votes', [
        post.author,
        post.permlink,
      ]);
      if (!Array.isArray(activeVotes)) return discussion;
      return {
        ...discussion,
        post: {
          ...post,
          positiveVotes: positiveVoteCount(activeVotes),
          negativeVotes: negativeVoteCount(activeVotes),
        },
      };
    } catch {
      return discussion;
    }
  };

  hiveReads.observeSocialOperation = async (record) => {
    if (TRANSACTION_ID_PATTERN.test(String(record?.transactionId || ''))) {
      const transaction = await hiveReads.getTransaction(record.transactionId);
      return exactTransactionObservation(record, transaction);
    }

    const operation = record?.operations?.[0];
    const [type, value] = operationTuple(operation);

    if (type === 'comment') {
      const author = requireHiveAccount(value?.author, 'Operation author');
      const permlink = requirePermlink(value?.permlink);
      const raw = await hiveReads.rpcPool.call('condenser_api', 'get_content', [author, permlink]);
      return raw?.author === author && raw?.permlink === permlink;
    }

    if (type === 'vote') {
      const voter = requireHiveAccount(value?.voter, 'Operation voter');
      const author = requireHiveAccount(value?.author, 'Vote target author');
      const permlink = requirePermlink(value?.permlink);
      const activeVotes = await hiveReads.rpcPool.call('condenser_api', 'get_active_votes', [
        author,
        permlink,
      ]);
      const vote = Array.isArray(activeVotes)
        ? activeVotes.find((item) => item?.voter === voter)
        : null;
      return Number(vote?.percent) === Number(value?.weight);
    }

    return originalObserveSocialOperation(record);
  };

  Object.defineProperty(hiveReads, HARDENED, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return hiveReads;
}

module.exports = {
  TRANSACTION_ID_PATTERN,
  applyReadConsistencyHardening,
  exactTransactionObservation,
  operationTuple,
  socialOperationEquivalent,
};
