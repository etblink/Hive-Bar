'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createApp } = require('../src/app');
const {
  buildLabelForCommit,
  readDeploymentIdentity,
} = require('../src/release/deployment-identity');
const { createFixtureRpc } = require('./support/fixture-rpc');
const { configFrom, logger } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');

function tempRelease() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hive-bar-identity-'));
}

function writeIdentity(rootDir, commit, tree) {
  if (commit !== undefined) fs.writeFileSync(path.join(rootDir, '.hive-bar-commit'), `${commit}\n`);
  if (tree !== undefined) fs.writeFileSync(path.join(rootDir, '.hive-bar-tree'), `${tree}\n`);
}

test('derives a deterministic beta build label from an exact deployed commit', () => {
  const commit = '0123456789abcdef0123456789abcdef01234567';
  assert.equal(buildLabelForCommit(commit), 'beta-0123456');
  assert.equal(buildLabelForCommit(null), 'beta-dev');
});

test('reads exact release commit and tree identity without consulting Git or the network', () => {
  const rootDir = tempRelease();
  const commit = '0123456789abcdef0123456789abcdef01234567';
  const tree = '89abcdef0123456789abcdef0123456789abcdef';
  writeIdentity(rootDir, commit, tree);

  try {
    assert.deepEqual(readDeploymentIdentity({ rootDir, strict: true }), {
      build: 'beta-0123456',
      commit,
      tree,
      exact: true,
    });
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('uses beta-dev only when no release identity exists and strict mode is off', () => {
  const rootDir = tempRelease();
  try {
    assert.deepEqual(readDeploymentIdentity({ rootDir }), {
      build: 'beta-dev',
      commit: null,
      tree: null,
      exact: false,
    });
    assert.throws(
      () => readDeploymentIdentity({ rootDir, strict: true }),
      /Exact deployment identity is required/,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('refuses partial or malformed release identity in every mode', () => {
  const cases = [
    ['partial commit', '0123456789abcdef0123456789abcdef01234567', undefined, /incomplete/],
    ['partial tree', undefined, '89abcdef0123456789abcdef0123456789abcdef', /incomplete/],
    ['bad commit', 'not-a-commit', '89abcdef0123456789abcdef0123456789abcdef', /commit identity is malformed/],
    ['bad tree', '0123456789abcdef0123456789abcdef01234567', 'not-a-tree', /tree identity is malformed/],
  ];

  for (const [name, commit, tree, expected] of cases) {
    const rootDir = tempRelease();
    writeIdentity(rootDir, commit, tree);
    try {
      assert.throws(() => readDeploymentIdentity({ rootDir }), expected, name);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

test('surfaces exact release identity through health and the beta label through the shell', async () => {
  const deploymentIdentity = Object.freeze({
    build: 'beta-0123456',
    commit: '0123456789abcdef0123456789abcdef01234567',
    tree: '89abcdef0123456789abcdef0123456789abcdef',
    exact: true,
  });
  const app = createApp({
    config: configFrom({ RATE_LIMIT_MAX: '1000' }),
    deploymentIdentity,
    logger,
    rpcPool: createFixtureRpc(),
  });

  const health = await request(app).get('/healthz').expect(200);
  assert.deepEqual(health.body, {
    status: 'ok',
    service: 'hive-bar',
    environment: 'test',
    writeMode: 'disabled',
    build: deploymentIdentity.build,
    commit: deploymentIdentity.commit,
    tree: deploymentIdentity.tree,
  });

  const response = await request(app).get('/').expect(200);
  const dom = new JSDOM(response.text);
  try {
    assert.equal(dom.window.document.querySelector('[data-build-label]')?.textContent.trim(), deploymentIdentity.build);
  } finally {
    dom.window.close();
  }
});

test('deployment and rollback gates bind health to exact build, commit, tree, UTC time, and subject', () => {
  const deploy = fs.readFileSync(path.join(ROOT, 'ops', 'privex', 'bin', 'hive-bar-deploy'), 'utf8');
  const rollback = fs.readFileSync(path.join(ROOT, 'ops', 'privex', 'bin', 'hive-bar-rollback'), 'utf8');

  for (const script of [deploy, rollback]) {
    assert.match(script, /build="beta-\$\{commit:0:7\}"/);
    assert.match(script, /health="\$\(curl/);
    assert.match(script, /\$health[\s\S]*\$build/);
    assert.match(script, /\$health[\s\S]*\$commit/);
    assert.match(script, /\$health[\s\S]*\$tree/);
    assert.match(script, /date -u/);
    assert.match(script, /--format=%s/);
    assert.match(script, /subject:/);
  }
  assert.match(rollback, /release tree identity/);
  assert.match(rollback, /rev-parse "\$\{commit\}\^\{tree\}"/);
});
