'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const manifest = require('../ops/privex/manifest.json');

function normalizeVersion(value) {
  return String(value || '').trim().replace(/^v/, '');
}

function assertPinnedRuntime(nodeVersion, npmVersion, expected = manifest.runtime) {
  const actualNode = normalizeVersion(nodeVersion);
  const actualNpm = normalizeVersion(npmVersion);

  if (actualNode !== expected.nodeVersion) {
    throw new Error(`Node must be exactly ${expected.nodeVersion}; found ${actualNode || 'unknown'}`);
  }
  if (actualNpm !== expected.npmVersion) {
    throw new Error(`npm must be exactly ${expected.npmVersion}; found ${actualNpm || 'unknown'}`);
  }

  return Object.freeze({ nodeVersion: actualNode, npmVersion: actualNpm });
}

function installedNpmVersion() {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : path.join(path.dirname(process.execPath), 'npm');
  const args = npmExecPath ? [npmExecPath, '--version'] : ['--version'];
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 10_000,
  }).trim();
}

if (require.main === module) {
  try {
    const summary = assertPinnedRuntime(process.versions.node, installedNpmVersion());
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`Hive-Bar runtime refused: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assertPinnedRuntime, normalizeVersion };
