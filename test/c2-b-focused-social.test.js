'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildPost } = require('../src/hive/social-operations');
const { configFrom } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');

function config() {
  return configFrom({ HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain' });
}

function payload(overrides = {}) {
  return {
    title: 'C2-B publishing test',
    body: 'A focused publishing fixture.',
    permlink: 'c2-b-publishing-test',
    tags: ['reno', 'nightlife'],
    ...overrides,
  };
}

test('C2-B omitted and explicit community destinations preserve the accepted community operation exactly', () => {
  const options = { account: 'etblink', config: config() };
  const omitted = buildPost({ ...options, payload: payload() });
  const explicit = buildPost({ ...options, payload: payload({ destination: 'community' }) });
  assert.deepEqual(explicit, omitted);
  assert.deepEqual(omitted.operations, [[
    'comment',
    {
      parent_author: '',
      parent_permlink: 'hive-108590',
      author: 'etblink',
      permlink: 'c2-b-publishing-test',
      title: 'C2-B publishing test',
      body: 'A focused publishing fixture.',
      json_metadata: JSON.stringify({
        tags: ['hive-108590', 'reno', 'nightlife'],
        app: 'fourth-street-bar-app/0.1.0',
        format: 'markdown',
      }),
    },
  ]]);
  assert.equal(omitted.summary.kind, 'Community post');
  assert.equal(omitted.summary.community, 'hive-108590');
});

test('C2-B personal root posts use the first user tag as category and never inject the community', () => {
  const prepared = buildPost({ account: 'etblink', config: config(), payload: payload({ destination: 'profile' }) });
  assert.deepEqual(prepared.operations, [[
    'comment',
    {
      parent_author: '',
      parent_permlink: 'reno',
      author: 'etblink',
      permlink: 'c2-b-publishing-test',
      title: 'C2-B publishing test',
      body: 'A focused publishing fixture.',
      json_metadata: JSON.stringify({
        tags: ['reno', 'nightlife'],
        app: 'fourth-street-bar-app/0.1.0',
        format: 'markdown',
      }),
    },
  ]]);
  assert.equal(prepared.summary.kind, 'Profile post');
  assert.equal(prepared.summary.destination, 'My profile');
  assert.equal(prepared.summary.category, 'reno');
  assert.doesNotMatch(JSON.stringify(prepared.operations), /hive-108590/);
});

test('C2-B personal root posts fall back to blog and invalid destinations fail closed', () => {
  const prepared = buildPost({ account: 'etblink', config: config(), payload: payload({ destination: 'profile', tags: [] }) });
  assert.equal(prepared.operations[0][1].parent_permlink, 'blog');
  assert.deepEqual(JSON.parse(prepared.operations[0][1].json_metadata).tags, ['blog']);
  assert.throws(
    () => buildPost({ account: 'etblink', config: config(), payload: payload({ destination: 'somewhere-else' }) }),
    /Post destination must be community or profile/,
  );
});

test('C2-B focused presentation remains separate from transaction controllers and leaves Threads untouched', () => {
  const composer = fs.readFileSync(path.join(ROOT, 'views/common/composer.ejs'), 'utf8');
  const vote = fs.readFileSync(path.join(ROOT, 'views/common/vote-form.ejs'), 'utf8');
  const wall = fs.readFileSync(path.join(ROOT, 'views/pages/profile/partials/wall-posts.ejs'), 'utf8');
  const thread = fs.readFileSync(path.join(ROOT, 'views/pages/community/partials/community-thread-list.ejs'), 'utf8');
  assert.match(composer, /<dialog/);
  assert.match(composer, /data-composer-dialog/);
  assert.match(composer, /data-composer-dialog-trigger/);
  assert.match(vote, /data-vote-open="upvote"/);
  assert.match(vote, /data-vote-open="downvote"/);
  assert.match(vote, /min="1"/);
  assert.match(vote, /max="100"/);
  assert.match(wall, /const wallEnabled = canWriteAction\('wall'\)/);
  assert.match(wall, /const inboxEnabled = canWriteAction\('inbox'\)/);
  assert.match(wall, /controller: 'm4'/);
  assert.match(wall, /action: 'inbox'/);
  assert.doesNotMatch(thread, /data-composer-dialog|dialog: true/);
});
