'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bindingsLibPath = path.join(
  root,
  'scripts',
  'production',
  'lib',
  'HiveBarDeployment.Bindings.ps1',
);
const examplePath = path.join(root, 'scripts', 'production', 'deployment-bindings.example.psd1');
const acceptedBindingPath = path.join(
  root,
  'scripts',
  'production',
  'bindings',
  'c2-d1-accepted.psd1',
);
const remoteTemplatePath = path.join(
  root,
  'scripts',
  'production',
  'remote',
  'production-deploy.sh.tmpl',
);
const ancestryDocPath = path.join(root, 'docs', 'PRODUCTION_DEPLOYMENT_ANCESTRY.md');

const read = (file) => fs.readFileSync(file, 'utf8');

test('ancestry-gap binding is explicit while direct-child bindings remain backward compatible', () => {
  const lib = read(bindingsLibPath);
  const example = read(examplePath);
  const accepted = read(acceptedBindingPath);

  assert.match(lib, /function Resolve-SourceParentCommit/);
  assert.match(lib, /ContainsKey\('SourceParentCommit'\)/);
  assert.match(lib, /return Require-String \$Release 'OldCommit' 'Release'/);
  assert.match(lib, /Assert-GitSha \$release\.SourceParentCommit 'Release\.SourceParentCommit'/);
  assert.match(lib, /compare\/\$\{oldCommit\}\.\.\.\$\{newCommit\}/);
  assert.match(lib, /merge_base_commit\.sha -ne \$OldCommit/);
  assert.match(lib, /status -ne 'ahead'/);
  assert.match(lib, /behind_by -ne 0/);

  assert.match(example, /Optional immediate Git parent of NewCommit/);
  assert.match(example, /SourceParentCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'/);
  assert.match(example, /harness then resolves SourceParentCommit to OldCommit exactly as before/);

  assert.doesNotMatch(
    accepted,
    /^\s*SourceParentCommit\s*=/m,
    'the accepted C2-D.1 direct-child binding must continue to work without the optional field',
  );
});

test('production entry, last-good, fail-closed, and Resume still use the deployed OldCommit', () => {
  const remote = read(remoteTemplatePath);

  assert.match(remote, /old_commit=__OLD_COMMIT__/);
  assert.match(remote, /Deploy entry is not the exact bound old release/);
  assert.match(remote, /last-good is not the exact old release/);
  assert.match(remote, /Resume requires last-good to remain the exact old release/);
  assert.match(remote, /DEPLOY_HELPER_AMBIGUOUS_FAILURE=YES/);
  assert.match(remote, /DO_NOT_AUTOMATICALLY_RETRY=YES/);
  assert.equal((remote.match(/"\$deploy_helper" "\$new_commit"/g) || []).length, 1);
});

test('direct-child and accepted ancestry-gap cases pass while wrong-parent and divergent cases fail', (t) => {
  const probe = spawnSync(
    'pwsh',
    ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
    { encoding: 'utf8' },
  );
  if (probe.error?.code === 'ENOENT') {
    t.skip('pwsh is not installed in this local qualification environment');
    return;
  }
  assert.equal(probe.status, 0, probe.stderr);

  const lib = bindingsLibPath.replaceAll("'", "''");
  const old = '0000000000000000000000000000000000000000';
  const sourceParent = '1111111111111111111111111111111111111111';
  const next = '2222222222222222222222222222222222222222';
  const other = '3333333333333333333333333333333333333333';

  const command = `
. '${lib}'
$old='${old}'
$source='${sourceParent}'
$new='${next}'
$other='${other}'
function New-Commit([string]$parent) {
  return [pscustomobject]@{ sha=$new; parents=@([pscustomobject]@{ sha=$parent }) }
}
function New-Comparison([string]$mergeBase, [string]$status, [long]$ahead, [long]$behind) {
  return [pscustomobject]@{
    base_commit=[pscustomobject]@{ sha=$old }
    merge_base_commit=[pscustomobject]@{ sha=$mergeBase }
    status=$status
    ahead_by=$ahead
    behind_by=$behind
  }
}
Assert-ReleaseAncestryBinding -Commit (New-Commit $old) -Comparison (New-Comparison $old 'ahead' 1 0) -NewCommit $new -SourceParentCommit $old -OldCommit $old
Assert-ReleaseAncestryBinding -Commit (New-Commit $source) -Comparison (New-Comparison $old 'ahead' 3 0) -NewCommit $new -SourceParentCommit $source -OldCommit $old
$wrongParentRejected=$false
try {
  Assert-ReleaseAncestryBinding -Commit (New-Commit $other) -Comparison (New-Comparison $old 'ahead' 3 0) -NewCommit $new -SourceParentCommit $source -OldCommit $old
} catch { $wrongParentRejected=$true }
if (-not $wrongParentRejected) { throw 'wrong source parent was accepted' }
$divergentRejected=$false
try {
  Assert-ReleaseAncestryBinding -Commit (New-Commit $source) -Comparison (New-Comparison $other 'diverged' 2 1) -NewCommit $new -SourceParentCommit $source -OldCommit $old
} catch { $divergentRejected=$true }
if (-not $divergentRejected) { throw 'divergent deployed-old ancestry was accepted' }
`;

  const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command', command], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('ancestry-gap documentation keeps source ancestry separate from deployment ancestry', () => {
  const doc = read(ancestryDocPath);
  assert.match(doc, /SourceParentCommit/);
  assert.match(doc, /OldCommit/);
  assert.match(doc, /strict Git ancestor/i);
  assert.match(doc, /does not change the remote deployment sequence/i);
  assert.match(doc, /do not automatically retry/i);
});
