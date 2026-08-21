'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { buildComment, buildPost, buildThread } = require('../src/hive/social-operations');
const { normalizeContent } = require('../src/hive/normalizers');
const { createApp } = require('../src/app');
const { createStaticAssetUrl } = require('../src/release/static-assets');
const { configFrom, logger } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');
const IMAGE = 'https://images.hive.blog/DQmExample/photo.png';

function config() {
  return configFrom({ HIVE_WRITE_MODE: 'beta', HIVE_SIGNER_MODE: 'keychain', RATE_LIMIT_MAX: '1000' });
}

function basePost(overrides = {}) {
  return {
    title: 'Image pipeline test',
    body: 'A beta image pipeline post.',
    permlink: 'image-pipeline-test',
    destination: 'community',
    tags: ['reno'],
    ...overrides,
  };
}

test('C2-D.1 preserves the exact no-image post operation shape', () => {
  const prepared = buildPost({ account: 'etblink', payload: basePost(), config: config() });
  const operation = prepared.operations[0][1];
  assert.equal(operation.body, 'A beta image pipeline post.');
  assert.deepEqual(JSON.parse(operation.json_metadata), {
    tags: ['hive-108590', 'reno'],
    app: 'fourth-street-bar-app/0.1.0',
    format: 'markdown',
  });
  assert.equal('image' in prepared.summary, false);
});

test('C2-D.1 binds one hosted image into post Markdown, structured metadata, and exact review summary', () => {
  const prepared = buildPost({
    account: 'etblink',
    payload: basePost({ imageUrl: IMAGE, imageAlt: 'Pool table at 4th Street Bar' }),
    config: config(),
  });
  const operation = prepared.operations[0][1];
  assert.equal(
    operation.body,
    `A beta image pipeline post.\n\n![Pool table at 4th Street Bar](${IMAGE})`,
  );
  assert.deepEqual(JSON.parse(operation.json_metadata).image, [IMAGE]);
  assert.equal(prepared.summary.image, IMAGE);
  assert.equal(prepared.summary.bodyBytes, Buffer.byteLength(operation.body, 'utf8'));
});

test('C2-D.1 applies the same one-image contract to Threads and replies without changing their parents', () => {
  const cfg = config();
  const thread = buildThread({
    account: 'etblink',
    config: cfg,
    threadContainer: { author: 'fourthst.threads', permlink: 'container' },
    payload: {
      body: 'Pool tonight?',
      permlink: 'pool-tonight',
      imageUrl: IMAGE,
      imageAlt: 'Pool table',
    },
  });
  assert.equal(thread.operations[0][1].parent_author, 'fourthst.threads');
  assert.equal(thread.operations[0][1].parent_permlink, 'container');
  assert.deepEqual(JSON.parse(thread.operations[0][1].json_metadata).image, [IMAGE]);
  assert.match(thread.operations[0][1].body, /!\[Pool table\]\(https:\/\/images\.hive\.blog\//);

  const comment = buildComment({
    account: 'etblink',
    config: cfg,
    payload: {
      body: 'Here is the photo.',
      permlink: 're-photo',
      parentAuthor: 'barfriend',
      parentPermlink: 'welcome',
      imageUrl: IMAGE,
      imageAlt: 'Front entrance',
    },
  });
  assert.equal(comment.operations[0][1].parent_author, 'barfriend');
  assert.equal(comment.operations[0][1].parent_permlink, 'welcome');
  assert.deepEqual(JSON.parse(comment.operations[0][1].json_metadata).image, [IMAGE]);
});

test('C2-D.1 image inputs fail closed on untrusted hosts, orphan descriptions, and final body limits', () => {
  const cfg = config();
  assert.throws(
    () => buildPost({ account: 'etblink', config: cfg, payload: basePost({ imageUrl: 'https://example.com/photo.png' }) }),
    /images\.hive\.blog/,
  );
  assert.throws(
    () => buildPost({ account: 'etblink', config: cfg, payload: basePost({ imageAlt: 'orphan alt' }) }),
    /requires an uploaded image/,
  );
  assert.throws(
    () => buildThread({
      account: 'etblink',
      config: cfg,
      threadContainer: { author: 'fourthst.threads', permlink: 'container' },
      payload: {
        body: 'x'.repeat(480),
        permlink: 'too-long-with-image',
        imageUrl: IMAGE,
      },
    }),
    /with its image reference must be 500 UTF-8 bytes or fewer/,
  );
});

test('C2-D.1 normalizes structured feed images through the existing Hive image proxy boundary', () => {
  const hosted = normalizeContent({
    author: 'etblink',
    permlink: 'hosted',
    title: 'Hosted',
    body: 'Body',
    json_metadata: JSON.stringify({ image: [IMAGE] }),
  });
  assert.equal(hosted.primaryImage, IMAGE);

  const external = normalizeContent({
    author: 'etblink',
    permlink: 'external',
    title: 'External',
    body: 'Body',
    json_metadata: JSON.stringify({ image: ['https://example.com/photo.jpg'] }),
  });
  assert.equal(external.primaryImage, 'https://images.hive.blog/0x0/https://example.com/photo.jpg');

  const unsafe = normalizeContent({
    author: 'etblink',
    permlink: 'unsafe',
    title: 'Unsafe',
    body: 'Body',
    json_metadata: JSON.stringify({ image: ['javascript:alert(1)'] }),
  });
  assert.equal(unsafe.primaryImage, '');
});

test('C2-D.1 exposes image authoring only on approved social/profile surfaces and keeps Wall/Inbox text-only', () => {
  const composerForm = fs.readFileSync(path.join(ROOT, 'views/common/composer/form.ejs'), 'utf8');
  const communityPost = fs.readFileSync(path.join(ROOT, 'views/pages/community/partials/community-post-list.ejs'), 'utf8');
  const profilePost = fs.readFileSync(path.join(ROOT, 'views/pages/profile/partials/user-blog-posts.ejs'), 'utf8');
  const threads = fs.readFileSync(path.join(ROOT, 'views/pages/community/partials/community-thread-list.ejs'), 'utf8');
  const fullPost = fs.readFileSync(path.join(ROOT, 'views/partials/full-post.ejs'), 'utf8');
  const comment = fs.readFileSync(path.join(ROOT, 'views/common/comment.ejs'), 'utf8');
  const settings = fs.readFileSync(path.join(ROOT, 'views/pages/profile/partials/settings.ejs'), 'utf8');
  const wall = fs.readFileSync(path.join(ROOT, 'views/pages/profile/partials/wall-posts.ejs'), 'utf8');
  assert.match(composerForm, /composer\.imageAttachment/);
  for (const source of [communityPost, profilePost, threads, fullPost, comment]) {
    assert.match(source, /imageAttachment: true/);
  }
  assert.match(settings, /mode: 'profile'/);
  assert.match(settings, /data-m4-action="profile"/);
  assert.doesNotMatch(wall, /imageAttachment|data-image-upload/);
});

test('C2-D.1 narrowly permits ImageHoster browser connections and serves versioned page-scoped media assets', async () => {
  const rpcPool = { call: async () => ({}), getStatus: () => [] };
  const app = createApp({ config: config(), logger, rpcPool });
  const response = await request(app).get('/').expect(200);
  assert.match(response.headers['content-security-policy'], /connect-src 'self' https:\/\/images\.hive\.blog/);
  assert.doesNotMatch(response.text, /\/css\/c2-d-media\.css(?:\?v=|")/);

  const assetUrl = createStaticAssetUrl(path.join(ROOT, 'public'));
  assert.match(assetUrl('/css/c2-d-media.css'), /^\/css\/c2-d-media\.css\?v=[0-9a-f]{64}$/);
  assert.match(assetUrl('/js/image-upload.js'), /^\/js\/image-upload\.js\?v=[0-9a-f]{64}$/);

  for (const filename of [
    'views/pages/community/index.ejs',
    'views/pages/post/index.ejs',
    'views/pages/profile/index.ejs',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
    assert.match(source, /assetUrl\('\/css\/c2-d-media\.css'\)/);
  }
});

test('C2-D.1 browser upload module contains no Hive broadcast path and preserves explicit no-auto-retry states', () => {
  const client = fs.readFileSync(path.join(ROOT, 'public/js/image-upload.js'), 'utf8');
  assert.match(client, /ImageSigningChallenge/);
  assert.match(client, /\.signBuffer\(/);
  assert.match(client, /https:\/\/images\.hive\.blog/);
  assert.match(client, /postStarted/);
  assert.match(client, /lockedAmbiguous/);
  assert.match(client, /Do not retry/);
  assert.doesNotMatch(client, /requestBroadcast|\.broadcast\(|requestTransfer|custom_json|\['vote'/);
});
