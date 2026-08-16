'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  applyReadConsistencyHardening,
  socialOperationEquivalent,
} = require('../src/hive/read-consistency');
const { assertReadOnlyRpcMethod } = require('../src/hive/read-methods');

function gitBlobSha(filename) {
  const normalized = fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
  const bytes = Buffer.from(normalized, 'utf8');
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
}

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function assertVersioned(template, publicPath, relativePath) {
  const revision = gitBlobSha(path.join(__dirname, '..', relativePath));
  assert.ok(
    template.includes(`${publicPath}?v=${revision}`),
    `${publicPath} must be bound to its exact Git blob revision`,
  );
}

test('M16.7 binds first-party CSS and JavaScript URLs to exact content revisions', () => {
  const head = source('views/common/head.ejs');
  const footer = source('views/common/footer.ejs');

  assertVersioned(head, '/css/style.css', 'public/css/style.css');
  assertVersioned(head, '/css/m15-social.css', 'public/css/m15-social.css');
  assertVersioned(footer, '/js/keychain-adapter.js', 'public/js/keychain-adapter.js');
  assertVersioned(footer, '/js/auth.js', 'public/js/auth.js');
  assertVersioned(footer, '/js/social-actions.js', 'public/js/social-actions.js');
  assertVersioned(footer, '/js/m4-actions.js', 'public/js/m4-actions.js');
  assertVersioned(footer, '/js/main.js', 'public/js/main.js');
});

test('M16.7 keeps new direct observation methods inside the read-only RPC allowlist', () => {
  assert.equal(
    assertReadOnlyRpcMethod('condenser_api', 'get_active_votes'),
    'condenser_api.get_active_votes',
  );
  assert.equal(
    assertReadOnlyRpcMethod('condenser_api', 'get_content'),
    'condenser_api.get_content',
  );
});

test('M16.7 normalizes tuple and appbase social operations for exact transaction matching', () => {
  assert.equal(
    socialOperationEquivalent(
      ['vote', { voter: 'etblink', author: 'fartman69', permlink: 'beta-post', weight: 100 }],
      {
        type: 'vote_operation',
        value: { voter: 'etblink', author: 'fartman69', permlink: 'beta-post', weight: 100 },
      },
    ),
    true,
  );
});

test('M16.7 observes a social write by exact transaction id and operation before indexed reads', async () => {
  const transactionId = 'a'.repeat(40);
  const operation = [
    'vote',
    { voter: 'etblink', author: 'fartman69', permlink: 'beta-post', weight: 100 },
  ];
  const hiveReads = {
    rpcPool: {
      async call() {
        throw new Error('indexed fallback should not be used when the transaction id is present');
      },
    },
    async getTransaction(id) {
      assert.equal(id, transactionId);
      return {
        transaction_id: transactionId,
        block_num: 456,
        operations: [
          {
            type: 'vote_operation',
            value: {
              voter: 'etblink',
              author: 'fartman69',
              permlink: 'beta-post',
              weight: 100,
            },
          },
        ],
      };
    },
    async getPostWithComments() {
      return { post: null, comments: [], profiles: {} };
    },
    async observeSocialOperation() {
      return false;
    },
  };

  applyReadConsistencyHardening(hiveReads);
  const observed = await hiveReads.observeSocialOperation({
    transactionId,
    operations: [operation],
  });
  assert.deepEqual(observed, { observed: true, blockNumber: 456 });
});

test('M16.7 falls back to direct active-vote lookup when Keychain provides no transaction id', async () => {
  const calls = [];
  const hiveReads = {
    rpcPool: {
      async call(api, method, params) {
        calls.push({ api, method, params });
        return [{ voter: 'etblink', percent: -100, rshares: '0' }];
      },
    },
    async getTransaction() {
      throw new Error('transaction lookup should not run without an id');
    },
    async getPostWithComments() {
      return { post: null, comments: [], profiles: {} };
    },
    async observeSocialOperation() {
      return false;
    },
  };

  applyReadConsistencyHardening(hiveReads);
  const observed = await hiveReads.observeSocialOperation({
    transactionId: null,
    operations: [
      ['vote', { voter: 'etblink', author: 'fartman69', permlink: 'beta-post', weight: -100 }],
    ],
  });
  assert.equal(observed, true);
  assert.deepEqual(calls, [
    {
      api: 'condenser_api',
      method: 'get_active_votes',
      params: ['fartman69', 'beta-post'],
    },
  ]);
});

test('M16.7 refreshes post vote counts from direct active votes while preserving page availability', async () => {
  const baseDiscussion = {
    post: {
      author: 'fartman69',
      permlink: 'beta-post',
      positiveVotes: 0,
      negativeVotes: 0,
    },
    comments: [],
    profiles: {},
  };
  const hiveReads = {
    rpcPool: {
      async call(api, method, params) {
        assert.equal(api, 'condenser_api');
        assert.equal(method, 'get_active_votes');
        assert.deepEqual(params, ['fartman69', 'beta-post']);
        return [
          { voter: 'fartman69', rshares: '0', percent: 100 },
          { voter: 'etblink', rshares: '0', percent: 100 },
          { voter: 'downvoter', rshares: '0', percent: -100 },
        ];
      },
    },
    async getTransaction() {
      return null;
    },
    async getPostWithComments() {
      return structuredClone(baseDiscussion);
    },
    async observeSocialOperation() {
      return false;
    },
  };

  applyReadConsistencyHardening(hiveReads);
  const discussion = await hiveReads.getPostWithComments('fartman69', 'beta-post');
  assert.equal(discussion.post.positiveVotes, 2);
  assert.equal(discussion.post.negativeVotes, 1);

  hiveReads.rpcPool.call = async () => {
    throw new Error('temporary direct vote read failure');
  };
  const fallback = await hiveReads.getPostWithComments('fartman69', 'beta-post');
  assert.equal(fallback.post.positiveVotes, 0);
  assert.equal(fallback.post.negativeVotes, 0);
});

test('M16.7 production startup wires read consistency hardening into the live read service', () => {
  const server = source('src/server.js');
  assert.match(server, /applyReadConsistencyHardening\(app\.locals\.services\.hiveReads\)/);
});
