'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  EXPECTED_APP_TAG,
  EXPECTED_V1_ACTIONS,
  EXPECTED_VERSION,
  assertFunctionalV1Baseline,
} = require('../scripts/check-functional-v1-baseline');
const { BETA_ACTIONS } = require('../src/beta/actions');
const { V1_ACTIONS } = require('../src/v1/actions');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('UX-1A extends beta while preserving the pre-final functional V1 baseline', () => {
  const summary = assertFunctionalV1Baseline();

  assert.equal(EXPECTED_VERSION, '0.1.0');
  assert.equal(EXPECTED_APP_TAG, 'fourth-street-bar-app/0.1.0');
  assert.deepEqual(EXPECTED_V1_ACTIONS, [
    'post',
    'thread',
    'comment',
    'vote',
    'follow',
    'unfollow',
    'subscribe',
    'unsubscribe',
    'profile',
    'claim-rewards',
    'wall',
    'inbox',
  ]);
  assert.deepEqual(V1_ACTIONS, EXPECTED_V1_ACTIONS);
  assert.deepEqual(BETA_ACTIONS, [
    'post',
    'comment',
    'vote',
    'follow',
    'unfollow',
    'subscribe',
    'unsubscribe',
    'claim-rewards',
    'wall',
    'inbox',
    'thread',
  ]);
  assert.deepEqual(summary, {
    profile: 'm17-functional-v1-baseline',
    packageVersion: '0.1.0',
    appTag: 'fourth-street-bar-app/0.1.0',
    v1ActionCount: 12,
    productionProfile: 'privex-beta-self-signing',
    v1ProductionActivated: false,
    finalRelease: false,
  });
});

test('M17.4 last-good bookkeeping is atomic and does not weaken explicit rollback', () => {
  const deploy = read('ops/privex/bin/hive-bar-deploy');
  const rollback = read('ops/privex/bin/hive-bar-rollback');

  assert.match(deploy, /^readonly last_good="\$app_root\/last-good"$/m);
  assert.match(deploy, /previous="\$\(readlink -f "\$current"/);
  assert.match(deploy, /expected_previous_tree="\$\(git --git-dir="\$repository" rev-parse/);
  assert.match(deploy, /\[\[ "\$previous_tree" == "\$expected_previous_tree" \]\]/);
  assert.match(deploy, /last_good_staging="\$app_root\/\.last-good\.\$\{previous_commit\}\.\$\$"/);
  assert.match(deploy, /ln -s "\$previous" "\$last_good_staging"/);
  assert.match(deploy, /mv -Tf "\$last_good_staging" "\$last_good"/);
  assert.match(deploy, /if \[\[ "\$previous" != "\$release" \]\]; then/);

  assert.match(rollback, /provide exactly one previously installed full commit SHA/);
  assert.match(rollback, /commit must be 40 lowercase hexadecimal characters/);
  assert.doesNotMatch(rollback, /commit=.*last_good/);
});

test('accepted M17 invariants coexist with historical M19.2 deployment evidence and current beta living documentation', () => {
  const readme = read('README.md');
  const roadmap = read('docs/ROADMAP.md');
  const operations = read('docs/PRODUCTION_OPERATIONS.md');
  const index = read('docs/README.md');
  const milestone = read('docs/M17_4_FUNCTIONAL_V1_BASELINE.md');

  assert.match(readme, /M17 is complete/);
  assert.match(readme, /M19\.2 remains the historical deployment event/);
  assert.match(readme, /e01407f5f29e3d0a1d41fe33fca129399b4cd2d4/);
  assert.match(roadmap, /Persistent production runtime: accepted beta self-signing profile\./);
  assert.match(roadmap, /### M17\.4 — Functional V1 baseline\r?\n\r?\n\*\*Accepted\.\*\*/);
  assert.match(roadmap, /### M18\.1–M18\.3\r?\n\r?\n\*\*Accepted in source\.\*\*/);
  assert.match(roadmap, /### M18\.4 — Beta-readiness closure\r?\n\r?\n\*\*Accepted in source\.\*\*/);
  assert.match(roadmap, /### M19\.3 — In-person Hive onboarding\r?\n\r?\n\*\*Current\.\*\*/);
  assert.match(
    operations,
    /last recorded accepted production transition: M19\.2 deployed M19\.1 commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`/,
  );
  assert.match(operations, /canonical repository source: moving branch `main`/);
  assert.match(operations, /Production remains beta until a separately authorized transition/);
  assert.match(operations, /last-good.*M17\.3/i);
  assert.match(index, /M17_4_FUNCTIONAL_V1_BASELINE\.md/);
  assert.match(index, /M19_1_COPY_AND_ONBOARDING_READINESS\.md/);
  assert.match(index, /M19_3_IN_PERSON_HIVE_ONBOARDING\.md/);
  assert.match(milestone, /No cosmetic redesign is required for M17\.4 acceptance/);
  assert.match(milestone, /canonicalization is not part of this source-qualification authorization/);
});
