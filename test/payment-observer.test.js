'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PaymentObserver } = require('../src/payments/payment-observer');

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

function observer(responses) {
  const calls = [];
  const rpcPool = {
    async callNode(nodeUrl, api, method, params) {
      calls.push({ nodeUrl, api, method, params });
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

test('confirms only after two independent nodes return the exact transaction', async () => {
  const fixture = observer({
    'https://node-1.example': transaction(),
    'https://node-2.example': transaction(),
    'https://node-3.example': new Error('offline'),
  });
  const result = await fixture.service.observe(receipt);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.corroborations, 2);
  assert.equal(result.blockNumber, 109000000);
  assert.equal(fixture.calls.length, 3);
  assert.deepEqual(new Set(fixture.calls.map((call) => call.nodeUrl)).size, 3);
  assert.ok(fixture.calls.every((call) => call.method === 'get_transaction'));
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
