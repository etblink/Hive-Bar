'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createUx1dVisualFixture } = require('./support/ux-1d-fixture');

const ROOT = path.join(__dirname, '..');
const capture = fs.readFileSync(path.join(ROOT, 'scripts', 'capture-ux-1d-visual.js'), 'utf8');
const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('UX-1D visual fixture is authenticated, multi-item, nested, and mutation-fail-closed', async () => {
  const fixture = createUx1dVisualFixture();
  assert.equal(fixture.account, 'etblink');
  assert.equal(fixture.config.hive.writeMode, 'beta');
  assert.equal(fixture.config.hive.signerMode, 'keychain');
  assert.equal(fixture.config.hive.v1SelfSigningEnabled, false);

  const cookie = `hive_bar_session=${fixture.token}`;
  const community = await request(fixture.app).get('/community').set('cookie', cookie).expect(200);
  assert.equal((community.text.match(/class="social-feed-item"/g) || []).length, 4);
  assert.match(community.text, /id="community-post-composer"/);
  assert.match(community.text, /Bar Friend/);
  assert.doesNotMatch(community.text, /Bar Friend &lt;script&gt;/);
  assert.doesNotMatch(community.text, /Technical Threads Container — Do Not Display/);

  const threads = await request(fixture.app).get('/community/threads').set('cookie', cookie).expect(200);
  assert.equal((threads.text.match(/social-comment--thread/g) || []).length, 5);
  assert.match(threads.text, /data-comment-depth="3"/);
  assert.doesNotMatch(threads.text, /Technical Threads Container — Do Not Display/);

  const conversation = await request(fixture.app)
    .get('/post/etblink/opening-night-update')
    .set('cookie', cookie)
    .expect(200);
  assert.equal((conversation.text.match(/social-comment--conversation/g) || []).length, 4);
  assert.match(conversation.text, /data-comment-depth="3"/);

  await request(fixture.app)
    .post('/api/social/preflight/vote')
    .send({ author: 'etblink', permlink: 'opening-night-update', direction: 'upvote', percent: 50 })
    .expect(405)
    .expect(({ body }) => assert.equal(body.error.code, 'UX_1D_VISUAL_MUTATION_FORBIDDEN'));
  assert.deepEqual(fixture.mutationAttempts, [
    { method: 'POST', path: '/api/social/preflight/vote' },
  ]);
});

test('UX-1D pinned-Chromium contract covers posts, Threads, nesting, mobile, and hierarchy assertions', () => {
  assert.equal(packageJson.scripts['test:visual:ux-1d'], 'node scripts/capture-ux-1d-visual.js');
  assert.match(capture, /Object\.freeze\(\[390, 1440\]\)/);
  for (const scenario of [
    'community-posts-composer-active',
    'threads-multiple-composer-active',
    'conversation-nested-replies',
  ]) assert.match(capture, new RegExp(scenario));
  assert.match(capture, /UX-1D visual qualification forbids Keychain signing/);
  assert.match(capture, /containerExposed/);
  assert.match(capture, /replyParentErrors/);
  assert.match(capture, /statusOwnershipErrors/);
  assert.match(capture, /tapTargetErrors/);
  assert.match(capture, /firstPostOrder\.author < evidence\.firstPostOrder\.content/);
  assert.match(capture, /depthThree\.left > depthTwo\.left/);
  assert.match(capture, /width === 390 \? 36 : 72/);
  assert.match(capture, /page\.keyboard\.press\('ArrowLeft'\)/);
  assert.match(capture, /page\.keyboard\.press\('ArrowRight'\)/);
  assert.match(capture, /assert\.deepEqual\(fixture\.mutationAttempts, \[\]\)/);
  assert.match(capture, /assert\.equal\(evidence\.scrollY, 0\)/);
});

test('UX-1D visual CI is additive after every accepted visual lane and uploads commit-bound evidence', () => {
  const job = workflow.match(
    /  ux-1d-visual-acceptance:\n[\s\S]*?(?=\n  live-read-smoke:)/,
  )?.[0];
  assert.ok(job);
  assert.match(job, /UX-1D content hierarchy visual acceptance \(Ubuntu \/ pinned Chromium\)/);
  assert.match(job, /needs:\n\s+- verify\n\s+- ux-1c-visual-acceptance/);
  assert.match(job, /npx --no-install playwright install --with-deps chromium/);
  assert.match(job, /UX_1D_VISUAL_OUTPUT: artifacts\/ux-1d-visual/);
  assert.match(job, /npm run test:visual:ux-1d/);
  assert.match(
    job,
    /ux-1d-visual-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/,
  );
  assert.match(job, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  for (const acceptedLane of [
    'M18.2 visual acceptance',
    'M18.3 Home / Wall / Pay visual acceptance',
    'M18.4 beta-readiness patron visual acceptance',
    'UX-1A Threads visual acceptance',
    'UX-1B composer visual acceptance',
    'UX-1C weighted voting visual acceptance',
  ]) assert.match(workflow, new RegExp(acceptedLane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
