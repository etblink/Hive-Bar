'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildSocialOperation,
  createPermlink,
  utf8Bytes,
} = require('../src/hive/social-operations');
const { configFrom } = require('./support/test-app');

const config = configFrom({ SESSION_SECRET: 'test-session-secret-that-is-at-least-32-bytes' });
const account = 'etblink';

function build(action, payload = {}, extra = {}) {
  return buildSocialOperation(action, { account, payload, config, ...extra });
}

test('matches the exact post operation golden vector', () => {
  const result = build('post', {
    title: 'Welcome to 4th Street',
    body: 'Pull up a stool. 🍺',
    permlink: 'welcome-to-fourth-street',
    tags: ['reno', 'nightlife', 'reno'],
    author: 'attacker',
  });

  assert.deepEqual(result.operations, [
    [
      'comment',
      {
        parent_author: '',
        parent_permlink: 'hive-108590',
        author: 'etblink',
        permlink: 'welcome-to-fourth-street',
        title: 'Welcome to 4th Street',
        body: 'Pull up a stool. 🍺',
        json_metadata:
          '{"tags":["hive-108590","reno","nightlife"],"app":"hivebar/0.1.0","format":"markdown"}',
      },
    ],
  ]);
  assert.equal(result.authority, 'Posting');
  assert.equal(result.summary.bodyBytes, 21);
  assert.match(result.fingerprint, /^[0-9a-f]{64}$/);
});

test('matches the exact resolved-container thread operation golden vector', () => {
  const result = build(
    'thread',
    { body: 'Who is stopping by tonight?', permlink: 'stopping-by-tonight' },
    { threadContainer: { author: 'fourthst.threads', permlink: 'threads-2026-08-11' } },
  );

  assert.deepEqual(result.operations, [
    [
      'comment',
      {
        parent_author: 'fourthst.threads',
        parent_permlink: 'threads-2026-08-11',
        author: 'etblink',
        permlink: 'stopping-by-tonight',
        title: '',
        body: 'Who is stopping by tonight?',
        json_metadata:
          '{"tags":["hive-108590","threads"],"app":"hivebar/0.1.0","format":"markdown"}',
      },
    ],
  ]);
});

test('matches the exact comment and vote operation golden vectors', () => {
  const comment = build('comment', {
    parentAuthor: 'barfriend',
    parentPermlink: 'hello-reno',
    permlink: 're-hello-reno-1',
    body: 'See you there.',
  });
  assert.deepEqual(comment.operations, [
    [
      'comment',
      {
        parent_author: 'barfriend',
        parent_permlink: 'hello-reno',
        author: 'etblink',
        permlink: 're-hello-reno-1',
        title: '',
        body: 'See you there.',
        json_metadata: '{"app":"hivebar/0.1.0","format":"markdown"}',
      },
    ],
  ]);

  const vote = build('vote', { author: 'barfriend', permlink: 'hello-reno', percent: 37 });
  assert.deepEqual(vote.operations, [
    ['vote', { voter: 'etblink', author: 'barfriend', permlink: 'hello-reno', weight: 3700 }],
  ]);
  assert.equal(vote.summary.percent, 37);
  assert.equal(vote.summary.weight, 3700);
});

test('matches exact follow and unfollow Hivemind golden vectors', () => {
  const follow = build('follow', { following: 'barfriend' });
  const unfollow = build('unfollow', { following: 'barfriend' });

  assert.deepEqual(follow.operations, [
    [
      'custom_json',
      {
        required_auths: [],
        required_posting_auths: ['etblink'],
        id: 'follow',
        json: '["follow",{"follower":"etblink","following":"barfriend","what":["blog"]}]',
      },
    ],
  ]);
  assert.deepEqual(unfollow.operations, [
    [
      'custom_json',
      {
        required_auths: [],
        required_posting_auths: ['etblink'],
        id: 'follow',
        json: '["follow",{"follower":"etblink","following":"barfriend","what":[]}]',
      },
    ],
  ]);
});

test('matches exact community subscribe and unsubscribe golden vectors', () => {
  const subscribe = build('subscribe');
  const unsubscribe = build('unsubscribe');

  assert.deepEqual(subscribe.operations, [
    [
      'custom_json',
      {
        required_auths: [],
        required_posting_auths: ['etblink'],
        id: 'community',
        json: '["subscribe",{"community":"hive-108590"}]',
      },
    ],
  ]);
  assert.deepEqual(unsubscribe.operations, [
    [
      'custom_json',
      {
        required_auths: [],
        required_posting_auths: ['etblink'],
        id: 'community',
        json: '["unsubscribe",{"community":"hive-108590"}]',
      },
    ],
  ]);
});

test('enforces protocol-shaped inputs and UTF-8 byte limits before Keychain', () => {
  assert.equal(utf8Bytes('🍺'.repeat(125)), 500);
  assert.doesNotThrow(() =>
    build(
      'thread',
      { body: '🍺'.repeat(125), permlink: 'five-hundred-bytes' },
      { threadContainer: { author: 'fourthst.threads', permlink: 'threads-today' } },
    ),
  );
  assert.throws(
    () =>
      build(
        'thread',
        { body: '🍺'.repeat(126), permlink: 'too-many-bytes' },
        { threadContainer: { author: 'fourthst.threads', permlink: 'threads-today' } },
      ),
    /500 UTF-8 bytes or fewer/,
  );
  assert.throws(
    () => build('vote', { author: 'barfriend', permlink: 'hello-reno', percent: 0 }),
    /whole number from 1 to 100/,
  );
  assert.throws(
    () => build('follow', { following: 'etblink' }),
    /cannot follow itself/,
  );
  assert.throws(
    () => build('post', { title: 'Hello', body: 'Body', permlink: 'hello', tags: ['Bad Tag'] }),
    /lowercase letters, numbers, or hyphens/,
  );
  assert.throws(
    () =>
      build(
        'thread',
        { body: 'Hello', permlink: 'hello' },
        { threadContainer: { author: 'wrong.container', permlink: 'threads-today' } },
      ),
    /does not match this deployment/,
  );
  const markdown = build('comment', {
    parentAuthor: 'barfriend',
    parentPermlink: 'hello-reno',
    permlink: 'preserve-markdown-spacing',
    body: '    indented code\n',
  });
  assert.equal(markdown.operations[0][1].body, '    indented code\n');
});

test('creates a bounded unique permlink from user-visible text', () => {
  const permlink = createPermlink('Pints & Friends 🍺', {
    now: () => Date.parse('2026-08-11T12:00:00.000Z'),
    random: () => Buffer.from('0011223344', 'hex'),
  });
  assert.equal(permlink, 'pints-friends-20260811120000000-0011223344');
});
