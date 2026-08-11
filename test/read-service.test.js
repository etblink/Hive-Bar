'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { HiveReadService, encodePageCursor } = require('../src/hive/read-service');

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
