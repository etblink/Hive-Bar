'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { HiveRpcPool, MAX_RPC_RESPONSE_BYTES } = require('../src/hive/rpc-pool');
const { UpstreamError } = require('../src/lib/errors');

const silentLogger = { warn() {} };

function rpcResponse(id, result, init = {}) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function rpcErrorResponse(id, code, message) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('fails over to the next node and sends a valid JSON-RPC request', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    if (url === 'https://one.example') return new Response('unavailable', { status: 503 });
    return rpcResponse(body.id, { head_block_number: 123 });
  };
  const pool = new HiveRpcPool({
    nodes: ['https://one.example', 'https://two.example'],
    fetchImpl,
    logger: silentLogger,
  });

  const result = await pool.call('condenser_api', 'get_dynamic_global_properties', []);

  assert.deepEqual(result, { head_block_number: 123 });
  assert.deepEqual(requests.map((request) => request.url), [
    'https://one.example',
    'https://two.example',
  ]);
  assert.equal(requests[0].body.jsonrpc, '2.0');
  assert.equal(requests[0].body.method, 'condenser_api.get_dynamic_global_properties');
  assert.deepEqual(requests[0].body.params, []);
});

test('opens a failed node circuit and bypasses it until cooldown', async () => {
  let now = 1_000;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    if (url === 'https://one.example') return new Response('down', { status: 500 });
    return rpcResponse(JSON.parse(options.body).id, 'ok');
  };
  const pool = new HiveRpcPool({
    nodes: ['https://one.example', 'https://two.example'],
    failureThreshold: 1,
    cooldownMs: 5_000,
    fetchImpl,
    logger: silentLogger,
    now: () => now,
  });

  assert.equal(await pool.call('condenser_api', 'get_dynamic_global_properties', []), 'ok');
  assert.equal(await pool.call('condenser_api', 'get_dynamic_global_properties', []), 'ok');
  assert.deepEqual(calls, ['https://one.example', 'https://two.example', 'https://two.example']);
  assert.equal(pool.getStatus()[0].available, false);

  now = 7_000;
  assert.equal(pool.getStatus()[0].available, true);
});

test('rejects oversized responses and fails over', async () => {
  const fetchImpl = async (url, options) => {
    const id = JSON.parse(options.body).id;
    if (url === 'https://one.example') {
      return new Response('{}', {
        status: 200,
        headers: { 'content-length': String(MAX_RPC_RESPONSE_BYTES + 1) },
      });
    }
    return rpcResponse(id, 'safe');
  };
  const pool = new HiveRpcPool({
    nodes: ['https://one.example', 'https://two.example'],
    fetchImpl,
    logger: silentLogger,
  });

  assert.equal(await pool.call('bridge', 'get_post', {}), 'safe');
});

test('stops streaming a response once its actual body exceeds the limit', async () => {
  let firstCancelled = false;
  const oversizedStream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(MAX_RPC_RESPONSE_BYTES + 1));
    },
    cancel() {
      firstCancelled = true;
    },
  });
  const fetchImpl = async (url, options) => {
    if (url === 'https://one.example') return new Response(oversizedStream, { status: 200 });
    return rpcResponse(JSON.parse(options.body).id, 'safe');
  };
  const pool = new HiveRpcPool({
    nodes: ['https://one.example', 'https://two.example'],
    fetchImpl,
    logger: silentLogger,
  });

  assert.equal(await pool.call('bridge', 'get_post', {}), 'safe');
  assert.equal(firstCancelled, true);
});

test('wraps exhausted RPC failures in an exposed service error', async () => {
  const pool = new HiveRpcPool({
    nodes: ['https://one.example'],
    fetchImpl: async () => new Response('{bad json', { status: 200 }),
    logger: silentLogger,
  });

  await assert.rejects(
    pool.call('bridge', 'get_post', {}),
    (error) =>
      error instanceof UpstreamError &&
      error.statusCode === 503 &&
      error.code === 'HIVE_RPC_UNAVAILABLE' &&
      error.cause?.message === 'Hive RPC returned invalid JSON',
  );
});

test('accepts an expected RPC application miss without failing over or penalizing the node', async () => {
  const requests = [];
  const pool = new HiveRpcPool({
    nodes: ['https://one.example', 'https://two.example'],
    fetchImpl: async (url, options) => {
      requests.push(url);
      const { id } = JSON.parse(options.body);
      return rpcErrorResponse(id, -32003, 'Unknown Transaction aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    },
    logger: silentLogger,
  });

  const result = await pool.call(
    'account_history_api',
    'get_transaction',
    { id: 'a'.repeat(40), include_reversible: true },
    {
      acceptRpcError: (error) =>
        error.code === -32003 && error.message.startsWith('Unknown Transaction'),
    },
  );

  assert.equal(result, null);
  assert.deepEqual(requests, ['https://one.example']);
  assert.equal(pool.getStatus()[0].failures, 0);
  assert.equal(pool.getStatus()[0].available, true);
});

test('queries one explicitly configured node without hidden failover', async () => {
  const requests = [];
  const pool = new HiveRpcPool({
    nodes: ['https://one.example', 'https://two.example'],
    fetchImpl: async (url, options) => {
      requests.push(url);
      return rpcResponse(JSON.parse(options.body).id, { transaction_id: 'a'.repeat(40) });
    },
    logger: silentLogger,
  });

  const result = await pool.callNode(
    'https://two.example',
    'account_history_api',
    'get_transaction',
    { id: 'a'.repeat(40), include_reversible: true },
  );
  assert.equal(result.transaction_id, 'a'.repeat(40));
  assert.deepEqual(requests, ['https://two.example']);
  await assert.rejects(
    pool.callNode('https://unconfigured.example', 'bridge', 'get_post', {}),
    /not configured/,
  );
});

test('allows the onboarding delegation read while preserving the write/unknown boundary', async () => {
  const requests = [];
  const pool = new HiveRpcPool({
    nodes: ['https://one.example'],
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return rpcResponse(body.id, [
        {
          delegator: 'etblink',
          delegatee: 'newhiver',
          vesting_shares: '10000.000000 VESTS',
        },
      ]);
    },
    logger: silentLogger,
  });

  const result = await pool.call(
    'condenser_api',
    'get_vesting_delegations',
    ['etblink', 'newhiver', 1],
  );

  assert.equal(result[0].vesting_shares, '10000.000000 VESTS');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'condenser_api.get_vesting_delegations');
  assert.deepEqual(requests[0].params, ['etblink', 'newhiver', 1]);

  await assert.rejects(
    pool.call('network_broadcast_api', 'broadcast_transaction', {}),
    (error) => error.code === 'READ_ONLY_RPC_POLICY',
  );
  await assert.rejects(
    pool.call('condenser_api', 'unknown_read_method', []),
    (error) => error.code === 'READ_ONLY_RPC_POLICY',
  );
  assert.equal(requests.length, 1);
});

test('blocks write and unknown RPC methods before making a network request', async () => {
  let fetchCalls = 0;
  const pool = new HiveRpcPool({
    nodes: ['https://one.example'],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('{}');
    },
    logger: silentLogger,
  });

  await assert.rejects(
    pool.call('network_broadcast_api', 'broadcast_transaction', {}),
    (error) => error.code === 'READ_ONLY_RPC_POLICY',
  );
  await assert.rejects(
    pool.call('condenser_api', 'get_account_history', []),
    (error) => error.code === 'READ_ONLY_RPC_POLICY',
  );
  assert.equal(fetchCalls, 0);
});
