'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SHA40_PATTERN = /^[0-9a-f]{40}$/;
const DEFAULT_RELEASE_ROOT = path.join(__dirname, '..', '..');

function buildLabelForCommit(commit) {
  return commit ? `beta-${commit.slice(0, 7)}` : 'beta-dev';
}

function readDeploymentIdentity(options = {}) {
  const rootDir = options.rootDir || DEFAULT_RELEASE_ROOT;
  const strict = options.strict === true;
  const commitPath = path.join(rootDir, '.hive-bar-commit');
  const treePath = path.join(rootDir, '.hive-bar-tree');
  const hasCommit = fs.existsSync(commitPath);
  const hasTree = fs.existsSync(treePath);

  if (!hasCommit && !hasTree) {
    if (strict) {
      throw new Error('Exact deployment identity is required but release identity files are missing');
    }
    return Object.freeze({
      build: buildLabelForCommit(null),
      commit: null,
      tree: null,
      exact: false,
    });
  }

  if (!hasCommit || !hasTree) {
    throw new Error('Deployment identity is incomplete');
  }

  const commit = fs.readFileSync(commitPath, 'utf8').trim();
  const tree = fs.readFileSync(treePath, 'utf8').trim();

  if (!SHA40_PATTERN.test(commit)) {
    throw new Error('Deployment commit identity is malformed');
  }
  if (!SHA40_PATTERN.test(tree)) {
    throw new Error('Deployment tree identity is malformed');
  }

  return Object.freeze({
    build: buildLabelForCommit(commit),
    commit,
    tree,
    exact: true,
  });
}

module.exports = {
  buildLabelForCommit,
  readDeploymentIdentity,
};
