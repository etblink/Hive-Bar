'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeProfile,
  safeObject,
  safeProfileImage,
} = require('../src/hive/normalizers');

test('profile metadata parsing fails closed', () => {
  assert.deepEqual(safeObject('{not json'), {});
  assert.deepEqual(safeObject('[]'), {});
  assert.deepEqual(safeObject('{"profile":{"name":"Ada"}}'), {
    profile: { name: 'Ada' },
  });
});

test('Bridge profile fields normalize into the view contract', () => {
  const result = normalizeProfile({
    name: 'alice',
    metadata: {
      profile: {
        name: 'Alice',
        about: 'Current',
        profile_image: 'https://images.hive.blog/u/alice/avatar',
      },
    },
    stats: { followers: 12, following: 4 },
    post_count: 9,
    reputation_ui: '62.1',
  });

  assert.equal(result.displayName, 'Alice');
  assert.equal(result.about, 'Current');
  assert.equal(result.profileImage, 'https://images.hive.blog/u/alice/avatar');
  assert.equal(result.followerCount, 12);
  assert.equal(result.followingCount, 4);
  assert.equal(result.postCount, 9);
  assert.equal(result.reputation, '62.1');
});

test('unapproved or unsafe avatar URLs fall back to the Hive image proxy', () => {
  const fallback = 'https://images.hive.blog/u/alice/avatar';

  assert.equal(safeProfileImage('javascript:alert(1)', 'alice'), fallback);
  assert.equal(safeProfileImage('http://example.com/avatar.png', 'alice'), fallback);
  assert.equal(safeProfileImage('https://example.com/avatar.png', 'alice'), fallback);
});
