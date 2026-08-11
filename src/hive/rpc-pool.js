'use strict';

const { UpstreamError } = require('../lib/errors');
const { assertReadOnlyRpcMethod } = require('./read-methods');

const MAX_RPC_RESPONSE_BYTES = 2 * 1024 * 1024;

async function readLimitedResponse(response) {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > MAX_RPC_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error('Hive RPC response is too large');
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks, byteLength).toString('utf8');
}

class HiveRpcPool {
  constructor({
    nodes,
    timeoutMs = 8000,
    failureThreshold = 2,
    cooldownMs = 30000,
    fetchImpl = globalThis.fetch,
    logger,
    now = Date.now,
  }) {
    if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError('HiveRpcPool requires nodes');
    if (typeof fetchImpl !== 'function') throw new TypeError('HiveRpcPool requires fetch');

    this.timeoutMs = timeoutMs;
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.now = now;
    this.requestId = 0;
    this.cursor = 0;
    this.nodes = nodes.map((url) => ({
      url,
      failures: 0,
      openUntil: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
    }));
  }

  getStatus() {
    const now = this.now();
    return this.nodes.map((node) => ({
      url: node.url,
      available: node.openUntil <= now,
      failures: node.failures,
      lastSuccessAt: node.lastSuccessAt,
      lastFailureAt: node.lastFailureAt,
    }));
  }

  async call(api, method, params = [], options = {}) {
    const rpcMethod = assertReadOnlyRpcMethod(api, method);
    const candidates = this.#orderedCandidates();
    let lastError;

    for (const node of candidates) {
      try {
        const result = await this.#callNode(node, rpcMethod, params, options);
        this.#recordSuccess(node);
        this.cursor = (this.nodes.indexOf(node) + 1) % this.nodes.length;
        return result;
      } catch (error) {
        lastError = error;
        this.#recordFailure(node, error, rpcMethod);
      }
    }

    throw new UpstreamError('Hive data is temporarily unavailable', { cause: lastError });
  }

  #orderedCandidates() {
    const now = this.now();
    const rotated = this.nodes.map((_, index) => this.nodes[(this.cursor + index) % this.nodes.length]);
    const available = rotated.filter((node) => node.openUntil <= now);
    if (available.length > 0) return available;

    return [...rotated].sort((left, right) => left.openUntil - right.openUntil).slice(0, 1);
  }

  async #callNode(node, method, params, options) {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    const id = ++this.requestId;
    const response = await this.fetch(node.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      redirect: 'error',
      signal,
    });

    if (!response.ok) throw new Error(`Hive RPC HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_RPC_RESPONSE_BYTES) throw new Error('Hive RPC response is too large');

    const text = await readLimitedResponse(response);

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error('Hive RPC returned invalid JSON');
    }

    if (payload.id !== id) throw new Error('Hive RPC response id mismatch');
    if (payload.error) {
      const error = new Error(payload.error.message || 'Hive RPC application error');
      error.code = payload.error.code;
      throw error;
    }
    if (!Object.hasOwn(payload, 'result')) throw new Error('Hive RPC response has no result');

    return payload.result;
  }

  #recordSuccess(node) {
    node.failures = 0;
    node.openUntil = 0;
    node.lastSuccessAt = new Date(this.now()).toISOString();
  }

  #recordFailure(node, error, method) {
    node.failures += 1;
    node.lastFailureAt = new Date(this.now()).toISOString();
    if (node.failures >= this.failureThreshold) node.openUntil = this.now() + this.cooldownMs;
    this.logger?.warn(
      {
        rpcNode: node.url,
        rpcMethod: method,
        failures: node.failures,
        circuitOpen: node.openUntil > this.now(),
        err: error,
      },
      'Hive RPC request failed',
    );
  }
}

module.exports = { HiveRpcPool, MAX_RPC_RESPONSE_BYTES, readLimitedResponse };
