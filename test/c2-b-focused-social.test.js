'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');
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

function wallLocals(enabledActions) {
  const enabled = new Set(enabledActions);
  return {
    userProfile: { name: 'etblink' },
    profileSettings: { wallFee: '1.000 HBD' },
    wallPage: { items: [], nextCursor: null },
    messageProfiles: {},
    hiveSession: { account: 'barfriend' },
    canWriteAction: (action) => enabled.has(action),
    formatHiveDate: (value) => value,
  };
}

async function renderWall(enabledActions) {
  return ejs.renderFile(
    path.join(ROOT, 'views/pages/profile/partials/wall-posts.ejs'),
    wallLocals(enabledActions),
  );
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

test('C2-B.1 focused presentation refines launchers without changing transaction controllers', () => {
  const composer = fs.readFileSync(path.join(ROOT, 'views/common/composer.ejs'), 'utf8');
  const composerField = fs.readFileSync(path.join(ROOT, 'views/common/composer/field.ejs'), 'utf8');
  const vote = fs.readFileSync(path.join(ROOT, 'views/common/vote-form.ejs'), 'utf8');
  const wall = fs.readFileSync(path.join(ROOT, 'views/pages/profile/partials/wall-posts.ejs'), 'utf8');
  const thread = fs.readFileSync(path.join(ROOT, 'views/pages/community/partials/community-thread-list.ejs'), 'utf8');
  const m4Client = fs.readFileSync(path.join(ROOT, 'public/js/m4-actions.js'), 'utf8');
  assert.match(composer, /<dialog/);
  assert.match(composer, /data-composer-dialog/);
  assert.match(composer, /data-composer-dialog-trigger/);
  assert.match(composer, /composer__dialog-trigger--icon/);
  assert.match(vote, /data-vote-open="upvote"/);
  assert.match(vote, /data-vote-open="downvote"/);
  assert.match(vote, /min="1"/);
  assert.match(vote, /max="100"/);
  assert.match(wall, /const wallEnabled = canWriteAction\('wall'\)/);
  assert.match(wall, /const inboxEnabled = canWriteAction\('inbox'\)/);
  assert.match(wall, /controller: 'm4'/);
  assert.match(wall, /action: privateOnly \? 'inbox' : 'wall'/);
  assert.match(wall, /role: 'wall-privacy-toggle'/);
  assert.match(composerField, /data-wall-privacy-toggle/);
  assert.match(thread, /action: 'thread'/);
  assert.match(thread, /dialog: true/);
  assert.match(thread, /triggerVariant: 'icon'/);
  assert.match(m4Client, /if \(action === 'wall'\)/);
  assert.match(m4Client, /if \(action === 'inbox'\)/);
  assert.match(m4Client, /adapter\.encodeMemo/);
});

test('C2-B.1 Wall-only rendering exposes public composition without a privacy option', async () => {
  const html = await renderWall(['wall']);
  assert.match(html, /data-wall-privacy-form/);
  assert.match(html, /data-m4-action="wall"/);
  assert.match(html, /data-wall-enabled="true"/);
  assert.match(html, /data-inbox-enabled="false"/);
  assert.match(html, /data-max-bytes="2000"/);
  assert.doesNotMatch(html, /data-wall-privacy-toggle/);
  assert.doesNotMatch(html, /data-m4-action="inbox"/);
});

test('C2-B.1 Inbox-only rendering becomes private-only and fail-closed', async () => {
  const html = await renderWall(['inbox']);
  assert.match(html, /data-wall-privacy-form/);
  assert.match(html, /data-m4-action="inbox"/);
  assert.match(html, /data-wall-enabled="false"/);
  assert.match(html, /data-inbox-enabled="true"/);
  assert.match(html, /data-composer-input checked disabled data-wall-privacy-toggle/);
  assert.match(html, /data-max-bytes="1500"/);
  assert.doesNotMatch(html, /data-m4-action="wall"/);
});

test('C2-B.1 combined Wall and Inbox rendering starts public with one privacy-selectable composer', async () => {
  const html = await renderWall(['wall', 'inbox']);
  assert.equal((html.match(/data-wall-privacy-form/g) || []).length, 1);
  assert.match(html, /data-m4-action="wall"/);
  assert.match(html, /data-wall-enabled="true"/);
  assert.match(html, /data-inbox-enabled="true"/);
  assert.match(html, /data-wall-privacy-toggle/);
  assert.match(html, /Encrypt this message \(private\)/);
  assert.match(html, /data-max-bytes="2000"/);
  assert.doesNotMatch(html, /data-m4-action="inbox"/);
});

test('C2-B.1 unavailable Wall and Inbox rendering exposes no composer', async () => {
  const html = await renderWall([]);
  assert.doesNotMatch(html, /data-wall-privacy-form/);
  assert.doesNotMatch(html, /data-m4-action="(?:wall|inbox)"/);
  assert.match(html, /Wall and private messaging aren’t available here yet/);
});
