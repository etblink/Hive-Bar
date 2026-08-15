'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PaymentObserver,
  irreversibleBlockNumber,
} = require('../src/payments/payment-observer');

const transactionId = 'a'.repeat(40);
const operations = [[
  'transfer',
  {
    from: 'etblink',
    to: 'fourthstreetbar',
    amount: '0.001 HBD',
    memo: 'v4v-pos:tab-123',
  },
]];
const receipt = { transactionId, operations };

function transaction(overrides = {}) {
  return {
    transaction_id: transactionId,
    block_num: 109000000,
    transaction_num: 2,
    timestamp: '2026-08-13T08:00:05',
    operations,
    ...overrides,
  };
}

function observer(responses, irreversibleBlocks = {}) {
  const calls = [];
  const rpcPool = {
    async callNode(nodeUrl, api, method, params) {
      calls.push({ nodeUrl, api, method, params });
      if (method === 'get_dynamic_global_properties') {
        const value = irreversibleBlocks[nodeUrl];
        if (value instanceof Error) throw value;
        return { last_irreversible_block_num: value ?? 109000100 };
      }
      const value = responses[nodeUrl];
      if (value instanceof Error) throw value;
      return value;
    },
  };
  return {
    calls,
    service: new PaymentObserver({
      rpcPool,
      nodeUrls: ['https://node-1.example', 'https://node-2.example', 'https://node-3.example'],
    }),
  };
}

test('confirms only after two independent nodes return the exact transaction irreversibly', async () => {
  const fixture = observer({
    'https://node-1.example': transaction(),
    'https://node-2.example': transaction(),
    'https://node-3.example': new Error('offline'),
  });
  const result = await fixture.service.observe(receipt);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.corroborations, 2);
  assert.equal(result.blockNumber, 109000000);
  assert.equal(fixture.calls.filter((call) => call.method === 'get_transaction').length, 3);
  assert.equal(fixture.calls.filter((call) => call.method === 'get_dynamic_global_properties').length, 2);
});

test('keeps reversible exact observations pending until two nodes report irreversibility', async () => {
  const fixture = observer(
    {
      'https://node-1.example': transaction(),
      'https://node-2.example': transaction(),
      'https://node-3.example': transaction(),
    },
    {
      'https://node-1.example': 108999999,
      'https://node-2.example': 109000000,
      'https://node-3.example': 108999998,
    },
  );
  const result = await fixture.service.observe(receipt);
  assert.equal(result.status, 'pending');
  assert.equal(result.corroborations, 1);
  assert.match(result.diagnostic, /irreversibly confirmed by only 1/);
});

test('keeps one-node observation pending and treats an exact-field mismatch as disagreement', async () => {
  const pending = observer({
    'https://node-1.example': transaction(),
    'https://node-2.example': null,
    'https://node-3.example': new Error('offline'),
  });
  assert.deepEqual(await pending.service.observe(receipt), {
    status: 'pending',
    diagnostic: 'Exact payment observed by 1 of 3 configured nodes; awaiting independent corroboration',
    corroborations: 1,
  });

  const mismatch = observer({
    'https://node-1.example': transaction(),
    'https://node-2.example': transaction({
      operations: [[
        'transfer',
        { ...operations[0][1], amount: '0.002 HBD' },
      ]],
    }),
    'https://node-3.example': null,
  });
  const result = await mismatch.service.observe(receipt);
  assert.equal(result.status, 'disagreement');
  assert.match(result.diagnostic, /must not be retried/);

  const timestampDisagreement = observer({
    'https://node-1.example': transaction(),
    'https://node-2.example': transaction({ timestamp: '2026-08-13T08:00:06' }),
    'https://node-3.example': null,
  });
  assert.equal((await timestampDisagreement.service.observe(receipt)).status, 'disagreement');
});

test('rejects confirmation inputs without a transaction id or independent nodes', async () => {
  assert.throws(
    () => new PaymentObserver({ rpcPool: { callNode() {} }, nodeUrls: ['https://only.example'] }),
    /at least two independent/,
  );
  const fixture = observer({});
  await assert.rejects(() => fixture.service.observe({ ...receipt, transactionId: null }), /valid transaction id/);
});

test('normalizes only valid positive last irreversible block numbers', () => {
  assert.equal(irreversibleBlockNumber({ last_irreversible_block_num: 123 }), 123);
  assert.equal(irreversibleBlockNumber({ last_irreversible_block_num: '123' }), 123);
  assert.equal(irreversibleBlockNumber({ last_irreversible_block_num: 0 }), null);
  assert.equal(irreversibleBlockNumber({}), null);
});
