'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeProfile, safeJsonObject } = require('../utils/profiles/fetchProfileData');

test('profile metadata parsing fails closed', () => {
  assert.deepEqual(safeJsonObject('{not json'), {});
  assert.deepEqual(safeJsonObject('[]'), {});
  assert.deepEqual(safeJsonObject('{"profile":{"name":"Ada"}}'), { profile: { name: 'Ada' } });
});

test('posting metadata safely overrides legacy profile fields', () => {
  const account = {
    name: 'alice',
    json_metadata: JSON.stringify({
      profile: { name: 'Old name', about: 'Legacy', profile_image: 'javascript:alert(1)' },
    }),
    posting_json_metadata: JSON.stringify({
      profile: { name: 'Alice', about: 'Current', profile_image: 'https://example.com/alice.png' },
    }),
  };

  const result = normalizeProfile(account, { follower_count: 12, following_count: 4 });

  assert.equal(result.profile.name, 'Alice');
  assert.equal(result.profile.about, 'Current');
  assert.equal(result.profile.profileImage, 'https://example.com/alice.png');
  assert.equal(result.follower_count, 12);
  assert.equal(result.following_count, 4);
});

test('unsafe avatar URLs fall back to the Hive image proxy', () => {
  const result = normalizeProfile(
    {
      name: 'alice',
      json_metadata: '{"profile":{"profile_image":"http://example.com/avatar.png"}}',
      posting_json_metadata: '{}',
    },
    {},
  );

  assert.equal(result.profile.profileImage, 'https://images.hive.blog/u/alice/avatar');
});
