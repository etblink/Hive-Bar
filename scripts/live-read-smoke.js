'use strict';

const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');
const { HiveReadService } = require('../src/hive/read-service');
const { HiveRpcPool } = require('../src/hive/rpc-pool');
const { createLogger } = require('../src/lib/logger');

async function run() {
  const config = loadConfig();
  assert.equal(config.hive.writeMode, 'disabled', 'Live smoke requires disabled Hive writes');
  assert.equal(config.hive.writesEnabled, false, 'Live smoke cannot run with writes enabled');

  const logger = createLogger(config);
  const rpcPool = new HiveRpcPool({
    nodes: config.hive.rpcNodes,
    timeoutMs: config.hive.rpcTimeoutMs,
    failureThreshold: config.hive.rpcFailureThreshold,
    cooldownMs: config.hive.rpcCooldownMs,
    logger,
  });
  const reads = new HiveReadService(rpcPool);

  const [head, community, postsPage, threadsData] = await Promise.all([
    rpcPool.call('condenser_api', 'get_dynamic_global_properties', []),
    reads.getCommunity(config.hive.communityId),
    reads.getCommunityPosts({ name: config.hive.communityId, sort: 'created' }),
    reads.getLatestThreads(config.hive.threadsContainerAccount),
  ]);

  assert.ok(Number(head?.head_block_number) > 0, 'Hive head block is missing');
  assert.equal(community?.name, config.hive.communityId, 'Configured community was not returned');
  assert.ok(Array.isArray(postsPage.items), 'Community posts are not an array');
  assert.ok(Array.isArray(threadsData.threads), 'Threads are not an array');

  let sampledProfile = null;
  let sampledDiscussion = null;
  let sampledWallet = null;
  if (postsPage.items[0]) {
    const first = postsPage.items[0];
    [sampledProfile, sampledDiscussion, sampledWallet] = await Promise.all([
      reads.getProfile(first.author),
      reads.getPostWithComments(first.author, first.permlink),
      reads.getWallet(first.author),
    ]);
    assert.equal(sampledProfile?.name, first.author, 'Sample author profile did not normalize');
    assert.equal(sampledDiscussion.post.author, first.author, 'Sample post discussion did not normalize');
    assert.equal(sampledWallet.account, first.author, 'Sample wallet did not normalize');
  }

  const report = {
    status: 'passed',
    mode: 'read-only',
    headBlock: Number(head.head_block_number),
    community: community.name,
    communityPostsObserved: postsPage.items.length,
    nextCommunityPageAvailable: Boolean(postsPage.nextCursor),
    threadsContainerAccount: config.hive.threadsContainerAccount,
    threadContainerObserved: Boolean(threadsData.container),
    threadsObserved: threadsData.threads.length,
    sampledAuthor: sampledProfile?.name || null,
    sampledComments: sampledDiscussion?.comments.length ?? null,
    sampledWalletDisplayedAt: sampledWallet?.displayedAt || null,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

run().catch((error) => {
  process.stderr.write(`Live read-only smoke failed: ${error.message}\n`);
  process.exitCode = 1;
});
