'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createUx1fVisualFixture } = require('./support/ux-1f-fixture');

const ROOT = path.join(__dirname, '..');
const capture = fs.readFileSync(path.join(ROOT, 'scripts/capture-ux-1f-visual.js'), 'utf8');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const ux1eWorkflow = fs.readFileSync(path.join(ROOT, '.github/workflows/ux-1e-visual.yml'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('UX-1F deterministic fixture supplies each update state and rejects mutation or unplanned Hive access', async () => {
  for (const status of ['ready', 'empty', 'unavailable']) {
    const fixture = createUx1fVisualFixture(status);
    await request(fixture.app).get('/').expect(200);
    await request(fixture.app)
      .post('/api/social/preflight/vote')
      .send({ author: 'etblink', permlink: 'fixture', direction: 'upvote', percent: 100 })
      .expect(405)
      .expect(({ body }) => assert.equal(body.error.code, 'UX_1F_VISUAL_MUTATION_FORBIDDEN'));

    assert.equal(fixture.readCalls.length, 1);
    assert.deepEqual(fixture.unexpectedReadCalls, []);
    assert.deepEqual(fixture.rpcPool.calls, []);
    assert.deepEqual(fixture.mutationAttempts, [
      { method: 'POST', path: '/api/social/preflight/vote' },
    ]);
  }
});

test('UX-1F pinned-Chromium contract covers every required viewport, degradation, safety, and accessibility gate', () => {
  assert.equal(packageJson.scripts['test:visual:ux-1f'], 'node scripts/capture-ux-1f-visual.js');
  assert.match(capture, /Object\.freeze\(\[360, 390, 768, 1024, 1440, 1600\]\)/);
  assert.match(capture, /Object\.freeze\(\[390, 1440\]\)/);
  for (const scenario of ['home-ready', 'home-empty', 'home-unavailable']) {
    assert.match(capture, new RegExp(`id: '${scenario}'`));
  }
  assert.match(capture, /assert\.equal\(manifest\.captures\.length, 10\)/);
  assert.match(capture, /UX-1F visual qualification forbids Keychain signing/);
  assert.match(capture, /reason: 'mutation-method'/);
  assert.match(capture, /reason: 'outbound-origin'/);
  assert.match(capture, /horizontalOverflow/);
  assert.match(capture, /ctaLimit/);
  assert.match(capture, /documentaryImages/);
  assert.match(capture, /ux1fAuthoredLoading/);
  assert.match(capture, /stateCardCount/);
  assert.match(capture, /page\.keyboard\.press\('Tab'\)/);
  assert.match(capture, /node\.matches\(':focus-visible'\)/);
  assert.match(capture, /globalThis\.axe\.run/);
  assert.match(capture, /\['serious', 'critical'\]/);
  assert.match(capture, /footerBottom <= result\.navigationTop/);
  assert.match(capture, /assert\.deepEqual\(fixture\.mutationAttempts, \[\]\)/);
  assert.match(capture, /assert\.deepEqual\(fixture\.rpcPool\.calls, \[\]\)/);
});

test('UX-1F visual CI is additive after accepted main-CI lanes and preserves the separate UX-1E lane', () => {
  const job = workflow.match(
    /  ux-1f-visual-acceptance:\n[\s\S]*?(?=\n  live-read-smoke:)/,
  )?.[0];
  assert.ok(job);
  assert.match(job, /UX-1F homepage visual acceptance \(Ubuntu \/ pinned Chromium\)/);
  assert.match(job, /needs:\n\s+- verify\n\s+- ux-1d-visual-acceptance/);
  assert.match(job, /npx --no-install playwright install --with-deps chromium/);
  assert.match(job, /UX_1F_VISUAL_OUTPUT: artifacts\/ux-1f-visual/);
  assert.match(job, /npm run test:visual:ux-1f/);
  assert.match(
    job,
    /ux-1f-visual-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/,
  );
  assert.match(job, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);

  for (const acceptedLane of [
    'M18.2 visual acceptance',
    'M18.3 Home / Wall / Pay visual acceptance',
    'M18.4 beta-readiness patron visual acceptance',
    'UX-1A Threads visual acceptance',
    'UX-1B composer visual acceptance',
    'UX-1C weighted voting visual acceptance',
    'UX-1D content hierarchy visual acceptance',
  ]) assert.match(workflow, new RegExp(acceptedLane.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(ux1eWorkflow, /UX-1E Wall \/ Inbox visual acceptance/);
  assert.match(ux1eWorkflow, /node scripts\/capture-ux-1e-visual\.js/);
});
