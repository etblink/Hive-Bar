'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  HiveReadService,
  encodeConnectionCursor,
  encodePageCursor,
  isUnknownTransaction,
} = require('../src/hive/read-service');

function rawPost(index) {
  return {
    author: 'alice',
    permlink: `post-${index}`,
    parent_author: '',
    parent_permlink: 'hive-108590',
    title: `Post ${index}`,
    body: `Body ${index}`,
    created: `2026-08-${String(index).padStart(2, '0')}T12:00:00`,
    active_votes: [],
  };
}

test('paginates Bridge posts, removes an inclusive anchor, and batches profiles', async () => {
  const calls = [];
  const anchor = rawPost(1);
  const pageItems = [anchor, ...Array.from({ length: 4 }, (_, index) => rawPost(index + 2))];
  const rpcPool = {
    async call(api, method, params) {
      calls.push({ api, method, params });
      if (method === 'get_ranked_posts') return pageItems;
      if (method === 'get_profiles') {
        return [{ name: 'alice', metadata: { profile: { name: 'Alice' } }, stats: {} }];
      }
      throw new Error('unexpected test RPC call');
    },
  };
  const service = new HiveReadService(rpcPool, { pageSize: 3 });
  const page = await service.getCommunityPosts({
    name: 'hive-108590',
    sort: 'created',
    cursor: encodePageCursor(anchor),
  });

  assert.deepEqual(page.items.map((item) => item.permlink), ['post-2', 'post-3', 'post-4']);
  assert.ok(page.nextCursor);
  assert.equal(page.profiles.alice.displayName, 'Alice');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params.limit, 5);
  assert.equal(calls[0].params.start_author, 'alice');
  assert.deepEqual(calls[1].params.accounts, ['alice']);
});

test('paginates followers, removes the inclusive anchor, and tolerates missing profiles', async () => {
  const calls = [];
  const anchor = 'friend02';
  const followers = ['friend02', 'friend03', 'friend04', 'friend05', 'friend06']
    .map((follower) => ({ follower, following: 'etblink', what: ['blog'] }));
  const rpcPool = {
    async call(api, method, params) {
      calls.push({ api, method, params });
      if (method === 'get_followers') return followers;
      if (method === 'get_profiles') {
        return [{
          name: 'friend03',
          metadata: {
            profile: {
              name: 'Friendly Three',
              profile_image: 'https://images.hive.blog/u/friend03/avatar',
            },
          },
          stats: {},
        }];
      }
      throw new Error('unexpected test RPC call');
    },
  };
  const service = new HiveReadService(rpcPool, { pageSize: 3 });
  const page = await service.getFollowers('etblink', encodeConnectionCursor(anchor));

  assert.deepEqual(page.items.map((item) => item.name), ['friend03', 'friend04', 'friend05']);
  assert.equal(page.items[0].displayName, 'Friendly Three');
  assert.equal(page.items[0].avatar, 'https://images.hive.blog/u/friend03/avatar');
  assert.equal(page.items[1].displayName, 'friend04');
  assert.equal(page.items[1].avatar, 'https://images.hive.blog/u/friend04/avatar/small');
  assert.equal(page.nextCursor, encodeConnectionCursor('friend05'));
  assert.deepEqual(calls[0], {
    api: 'condenser_api',
    method: 'get_followers',
    params: ['etblink', anchor, 'blog', 5],
  });
  assert.deepEqual(calls[1].params.accounts, ['friend03', 'friend04', 'friend05']);
});

test('paginates following by its account field and rejects malformed cursors before RPC', async () => {
  const calls = [];
  const rpcPool = {
    async call(api, method, params) {
      calls.push({ api, method, params });
      if (method === 'get_following') {
        return [{ follower: 'etblink', following: 'friend01', what: ['blog'] }];
      }
      if (method === 'get_profiles') return [];
      throw new Error('unexpected test RPC call');
    },
  };
  const service = new HiveReadService(rpcPool, { pageSize: 3 });
  const page = await service.getFollowing('etblink');

  assert.deepEqual(page.items, [{
    name: 'friend01',
    displayName: 'friend01',
    avatar: 'https://images.hive.blog/u/friend01/avatar/small',
  }]);
  assert.equal(page.nextCursor, null);
  assert.deepEqual(calls[0].params, ['etblink', '', 'blog', 4]);

  await assert.rejects(
    service.getFollowing('etblink', 'not+base64!'),
    /Connection pagination cursor is invalid/,
  );
  assert.equal(calls.length, 2);
});

test('normalizes a flattened Bridge discussion into chronological nested comment depth', async () => {
  const rpcPool = {
    async call(_api, method) {
      if (method === 'get_discussion') {
        return {
          'alice/root': { ...rawPost(1), permlink: 'root' },
          'bob/re-root': {
            ...rawPost(2),
            author: 'bob',
            permlink: 're-root',
            parent_author: 'alice',
            parent_permlink: 'root',
          },
          'carol/re-bob': {
            ...rawPost(3),
            author: 'carol',
            permlink: 're-bob',
            parent_author: 'bob',
            parent_permlink: 're-root',
          },
        };
      }
      if (method === 'get_profiles') {
        return ['alice', 'bob', 'carol'].map((name) => ({ name, metadata: {}, stats: {} }));
      }
      throw new Error('unexpected test RPC call');
    },
  };
  const service = new HiveReadService(rpcPool);
  const discussion = await service.getPostWithComments('alice', 'root');

  assert.equal(discussion.post.permlink, 'root');
  assert.deepEqual(discussion.comments.map((comment) => comment.depth), [1, 2]);
});

test('treats an exactly matched unindexed transaction response as pending observation', async () => {
  const transactionId = 'a'.repeat(40);
  const rpcPool = {
    async call(api, method, params, options) {
      assert.equal(api, 'account_history_api');
      assert.equal(method, 'get_transaction');
      assert.deepEqual(params, { id: transactionId, include_reversible: true });
      assert.equal(
        options.acceptRpcError({
          code: -32003,
          message: `Assert Exception:false: Unknown Transaction ${transactionId}`,
        }),
        true,
      );
      return null;
    },
  };
  const service = new HiveReadService(rpcPool);
  const observation = await service.observeM4Operation({
    transactionId,
    operations: [['account_update2', { account: 'fartman69', posting_json_metadata: '{}' }]],
  });

  assert.deepEqual(observation, { observed: false, blockNumber: null });
  assert.equal(
    isUnknownTransaction(
      { code: -32003, message: `Unknown Transaction ${'b'.repeat(40)}` },
      transactionId,
    ),
    false,
  );
  assert.equal(
    isUnknownTransaction(
      { code: -32004, message: `Unknown Transaction ${transactionId}` },
      transactionId,
    ),
    false,
  );
});
