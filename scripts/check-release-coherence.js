'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { RELEASE_APP_TAG, PACKAGE_VERSION } = require('../src/release/release-version');
const { V1_ACTIONS } = require('../src/v1/actions');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function assertReleaseCoherence() {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const manifest = JSON.parse(read('ops/privex/manifest.json'));
  const envExample = read('.env.example');
  const privexEnv = read('ops/privex/hive-bar.env.example');
  const workflow = read('.github/workflows/ci.yml');
  const readme = read('README.md');
  const roadmap = read('docs/ROADMAP.md');
  const operations = read('docs/PRODUCTION_OPERATIONS.md');

  if (pkg.version !== PACKAGE_VERSION) throw new Error('package version source is inconsistent');
  if (lock.packages?.['']?.version !== PACKAGE_VERSION) {
    throw new Error('package-lock root version must match package.json');
  }
  if (manifest.release?.hiveAppTag !== RELEASE_APP_TAG) {
    throw new Error('Privex manifest app tag must match the derived release app tag');
  }
  for (const [name, source] of [['.env.example', envExample], ['ops/privex/hive-bar.env.example', privexEnv]]) {
    requireMatch(
      source,
      new RegExp(`^HIVE_APP_TAG=${RELEASE_APP_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'),
      `${name} must use the derived release app tag`,
    );
  }

  requireMatch(workflow, /uses:\s+actions\/checkout@[0-9a-f]{40}(?:\s+#.*)?$/m, 'checkout must be pinned by full commit SHA');
  requireMatch(workflow, /uses:\s+actions\/setup-node@[0-9a-f]{40}(?:\s+#.*)?$/m, 'setup-node must be pinned by full commit SHA');
  requireMatch(readme, /Node\.js `24\.19\.0`/, 'README must state the pinned Node runtime');
  requireMatch(readme, /M17 is complete/, 'README must identify M17 as complete');
  requireMatch(roadmap, /### M17\.4 — Functional V1 baseline[\s\S]*?\*\*Accepted\.\*\*/, 'roadmap must identify M17.4 as accepted');
  requireMatch(roadmap, /### M18\.1–M18\.3[\s\S]*?\*\*Accepted in source\.\*\*/, 'roadmap must identify M18.1–M18.3 as accepted in source');
  requireMatch(roadmap, /### M18\.4 — Beta-readiness closure[\s\S]*?\*\*Accepted in source\.\*\*/, 'roadmap must identify M18.4 as accepted in source');
  requireMatch(roadmap, /### M19\.1 — Copy and onboarding readiness[\s\S]*?\*\*Accepted\.\*\*/, 'roadmap must identify M19.1 as accepted');
  requireMatch(roadmap, /### M19\.2 — Controlled beta deployment[\s\S]*?\*\*Accepted\.\*\*/, 'roadmap must identify M19.2 as accepted');
  requireMatch(roadmap, /### M19\.3 — In-person Hive onboarding[\s\S]*?\*\*Current\.\*\*/, 'roadmap must identify M19.3 as current');
  requireMatch(operations, /deployed source: accepted M19\.1 commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`/, 'operations must identify the deployed M19.1 source boundary');
  requireMatch(operations, /last-good.*M17\.3/i, 'operations must retain M17.3 as the last-good boundary');
  requireMatch(operations, /in-person onboarding: not production-activated/, 'operations must distinguish M19.3 source from onboarding activation');
  if (/\bMIT License\b/i.test(readme)) {
    throw new Error('README must not claim an open-source license that the repository does not provide');
  }

  if (!Array.isArray(manifest.v1?.selfSignedActions)) {
    throw new Error('Privex manifest must publish the frozen V1 self-signing action set');
  }
  if (JSON.stringify(manifest.v1.selfSignedActions) !== JSON.stringify(V1_ACTIONS)) {
    throw new Error('Privex manifest V1 action set must match src/v1/actions.js');
  }
  if (manifest.runtimeProfiles?.wiredV1 !== 'privex-v1-self-signing') {
    throw new Error('Privex manifest must identify the wired V1 runtime profile');
  }
  if (manifest.runtimeProfiles?.acceptedBeta !== 'privex-beta-self-signing') {
    throw new Error('Privex manifest must retain the accepted beta runtime profile');
  }
  if (manifest.v1?.status !== 'runtime-wired-not-production-activated') {
    throw new Error('Privex manifest must distinguish V1 runtime wiring from production activation');
  }
  if (manifest.release?.lastGoodPath !== '/opt/hive-bar/last-good') {
    throw new Error('Privex manifest must publish the canonical last-good path');
  }
  if (manifest.release?.lastGoodPolicy !== 'previous-validated-current-before-switch') {
    throw new Error('Privex manifest must publish the reviewed last-good update policy');
  }

  for (const requiredPath of [
    'docs/README.md',
    'docs/ROADMAP.md',
    'docs/PRODUCTION_OPERATIONS.md',
    'docs/M17_1_V1_PRODUCT_BOUNDARY.md',
    'docs/M17_2_SOURCE_OF_TRUTH_AND_V1_GATE.md',
    'docs/M17_3_RUNTIME_V1_WIRING_AND_OPERATIONAL_ACCEPTANCE.md',
    'docs/M17_4_FUNCTIONAL_V1_BASELINE.md',
    'docs/M19_1_COPY_AND_ONBOARDING_READINESS.md',
    'docs/M19_3_IN_PERSON_HIVE_ONBOARDING.md',
  ]) {
    if (!fs.existsSync(path.join(root, requiredPath))) {
      throw new Error(`required living/release document is missing: ${requiredPath}`);
    }
  }

  return Object.freeze({
    packageVersion: PACKAGE_VERSION,
    appTag: RELEASE_APP_TAG,
    v1ActionCount: V1_ACTIONS.length,
  });
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(assertReleaseCoherence())}\n`);
  } catch (error) {
    process.stderr.write(`Hive-Bar release coherence refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assertReleaseCoherence };
