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
const { FIRST_PARTY_ASSETS, createStaticAssetUrl } = require('../src/release/static-assets');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('M16.7 binds first-party CSS and JavaScript URLs to exact runtime bytes', () => {
  const publicRoot = path.join(__dirname, '..', 'public');
  const assetUrl = createStaticAssetUrl(publicRoot);
  for (const publicPath of FIRST_PARTY_ASSETS) {
    const filename = path.join(publicRoot, publicPath.slice(1));
    const digest = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
    assert.equal(assetUrl(publicPath), `${publicPath}?v=${digest}`);
  }

  const head = source('views/common/head.ejs');
  const footer = source('views/common/footer.ejs');
  const profile = source('views/pages/profile/index.ejs');
  const pay = source('views/pages/pay/index.ejs');
  const onboardingCustomer = source('views/pages/onboarding/index.ejs');
  const onboardingStaff = source('views/pages/onboarding/staff.ejs');
  const pageScopedJavascript = new Set([
    '/js/onboarding-customer.js',
    '/js/onboarding-staff.js',
  ]);
  assert.ok(head.includes("assetUrl('/css/style.css')"));
  assert.ok(head.includes("assetUrl('/css/m15-social.css')"));
  assert.ok(profile.includes("assetUrl('/css/m15-wallet-pay.css')"));
  assert.ok(pay.includes("assetUrl('/css/m15-wallet-pay.css')"));
  for (const publicPath of FIRST_PARTY_ASSETS.filter(
    (item) => item.startsWith('/js/') && !pageScopedJavascript.has(item),
  )) {
    assert.ok(footer.includes(`assetUrl('${publicPath}')`));
  }
  assert.ok(onboardingCustomer.includes("assetUrl('/js/onboarding-customer.js')"));
  assert.ok(onboardingStaff.includes("assetUrl('/js/onboarding-staff.js')"));
  assert.throws(() => assetUrl('/js/not-registered.js'), /not registered for versioning/);
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

test('M16.7 production startup wires both hardening layers into the live server', () => {
  const server = source('src/server.js');
  assert.match(server, /applyReadConsistencyHardening\(app\.locals\.services\.hiveReads\)/);
  assert.match(server, /app\.locals\.assetUrl = createStaticAssetUrl/);
});
