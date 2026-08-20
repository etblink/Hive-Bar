'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { assertReleaseCoherence } = require('./check-release-coherence');
const { PACKAGE_VERSION, RELEASE_APP_TAG } = require('../src/release/release-version');
const { V1_ACTIONS } = require('../src/v1/actions');

const root = path.join(__dirname, '..');
const EXPECTED_VERSION = '0.1.0';
const EXPECTED_APP_TAG = 'fourth-street-bar-app/0.1.0';
const EXPECTED_V1_ACTIONS = Object.freeze([
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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertFunctionalV1Baseline() {
  assertReleaseCoherence();

  const manifest = JSON.parse(read('ops/privex/manifest.json'));
  const roadmap = read('docs/ROADMAP.md');
  const operations = read('docs/PRODUCTION_OPERATIONS.md');
  const deploy = read('ops/privex/bin/hive-bar-deploy');

  if (PACKAGE_VERSION !== EXPECTED_VERSION) {
    throw new Error(`M17.4 must remain pre-final package version ${EXPECTED_VERSION}`);
  }
  if (RELEASE_APP_TAG !== EXPECTED_APP_TAG) {
    throw new Error(`M17.4 app tag must remain exactly ${EXPECTED_APP_TAG}`);
  }
  if (JSON.stringify(V1_ACTIONS) !== JSON.stringify(EXPECTED_V1_ACTIONS)) {
    throw new Error('V1 action manifest drifted from the accepted M20.2 twelve-action boundary');
  }
  if (JSON.stringify(manifest.v1?.selfSignedActions) !== JSON.stringify(EXPECTED_V1_ACTIONS)) {
    throw new Error('Privex manifest drifted from the accepted M20.2 twelve-action V1 boundary');
  }
  if (manifest.runtimeProfiles?.acceptedBeta !== 'privex-beta-self-signing') {
    throw new Error('M17.4 must retain the accepted beta production profile');
  }
  if (manifest.runtimeProfiles?.wiredV1 !== 'privex-v1-self-signing') {
    throw new Error('M17.4 must retain the wired V1 self-signing profile');
  }
  if (manifest.v1?.status !== 'runtime-wired-not-production-activated') {
    throw new Error('M17.4 must not claim that V1 production activation has occurred');
  }
  if (manifest.v1?.paymentsEnabled !== false || manifest.v1?.distriatorEnabled !== false) {
    throw new Error('M17.4 must keep Pay and Distriator outside V1');
  }
  if (manifest.release?.lastGoodPath !== '/opt/hive-bar/last-good') {
    throw new Error('M17.4 must publish the canonical last-good release path');
  }
  if (manifest.release?.lastGoodPolicy !== 'previous-validated-current-before-switch') {
    throw new Error('M17.4 must publish the reviewed last-good update policy');
  }
  if (!/### M17\.4 — Functional V1 baseline[\s\S]*?\*\*Accepted\.\*\*/.test(roadmap)) {
    throw new Error('living roadmap must identify M17.4 as accepted');
  }
  if (!/last recorded accepted production transition: M19\.2 deployed M19\.1 commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`/.test(operations)) {
    throw new Error('production operations must retain M19.2 as the historical accepted M19.1 deployment event');
  }
  if (!/Production remains beta until a separately authorized transition/.test(operations)) {
    throw new Error('production operations must keep V1 activation outside later beta milestones');
  }
  if (!/last-good.*M17\.3/i.test(operations)) {
    throw new Error('production operations must retain exact M17.3 as the recorded last-good boundary');
  }
  for (const pattern of [
    /readonly last_good="\$app_root\/last-good"/,
    /expected_previous_tree="\$\(git --git-dir="\$repository" rev-parse "\$\{previous_commit\}\^\{tree\}"\)"/,
    /ln -s "\$previous" "\$last_good_staging"/,
    /mv -Tf "\$last_good_staging" "\$last_good"/,
  ]) {
    if (!pattern.test(deploy)) {
      throw new Error('deployment helper no longer preserves deterministic last-good bookkeeping');
    }
  }

  return Object.freeze({
    profile: 'm17-functional-v1-baseline',
    packageVersion: PACKAGE_VERSION,
    appTag: RELEASE_APP_TAG,
    v1ActionCount: V1_ACTIONS.length,
    productionProfile: 'privex-beta-self-signing',
    v1ProductionActivated: false,
    finalRelease: false,
  });
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(assertFunctionalV1Baseline())}\n`);
  } catch (error) {
    process.stderr.write(`Hive-Bar M17.4 functional baseline refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  EXPECTED_APP_TAG,
  EXPECTED_V1_ACTIONS,
  EXPECTED_VERSION,
  assertFunctionalV1Baseline,
};
