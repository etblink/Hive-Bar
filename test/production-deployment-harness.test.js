'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const harnessPath = path.join(root, 'scripts', 'production', 'Invoke-HiveBarExactProductionDeployment.ps1');
const examplePath = path.join(root, 'scripts', 'production', 'deployment-bindings.example.psd1');
const c2d1Path = path.join(root, 'scripts', 'production', 'bindings', 'c2-d1-accepted.psd1');
const bindingsLibPath = path.join(root, 'scripts', 'production', 'lib', 'HiveBarDeployment.Bindings.ps1');
const executionLibPath = path.join(root, 'scripts', 'production', 'lib', 'HiveBarDeployment.Execution.ps1');
const remoteTemplatePath = path.join(root, 'scripts', 'production', 'remote', 'production-deploy.sh.tmpl');
const docPath = path.join(root, 'docs', 'PRODUCTION_DEPLOYMENT_HARNESS.md');

const read = (file) => fs.readFileSync(file, 'utf8');
const engineSource = () => [harnessPath, bindingsLibPath, executionLibPath, remoteTemplatePath].map(read).join('\n');

test('canonical deployment harness artifacts are preserved', () => {
  for (const file of [harnessPath, examplePath, c2d1Path, bindingsLibPath, executionLibPath, remoteTemplatePath, docPath]) {
    assert.equal(fs.existsSync(file), true, `${file} must exist`);
  }
});

test('harness exposes Observe, Deploy, and Resume with an explicit mutation guard', () => {
  const source = engineSource();
  assert.match(source, /\[ValidateSet\('Observe', 'Deploy', 'Resume'\)\]/);
  assert.match(source, /\[switch\]\$AuthorizeProductionMutation/);
  assert.match(source, /Deploy requires -AuthorizeProductionMutation|requires -AuthorizeProductionMutation/);
  assert.match(source, /Resume requires -AuthorizeProductionMutation|requires -AuthorizeProductionMutation/);
});

test('deployment helper is bound to Deploy and is not replayed by Resume', () => {
  const source = engineSource();
  const deployCase = source.match(/Deploy\)\s*([\s\S]*?)\n\s*;;/);
  const resumeCase = source.match(/Resume\)\s*([\s\S]*?)\n\s*;;/);
  assert.ok(deployCase, 'Deploy case must exist');
  assert.ok(resumeCase, 'Resume case must exist');

  assert.match(deployCase[1], /"\$deploy_helper" "\$new_commit"/);
  assert.match(deployCase[1], /DEPLOY_HELPER_AMBIGUOUS_FAILURE=YES/);
  assert.doesNotMatch(resumeCase[1], /"\$deploy_helper"/);
  assert.match(resumeCase[1], /RESUME_RESTART_SKIPPED=ALREADY_BETA/);
});

test('beta gate occurs only in beta-qualified branches, never in the Deploy read-only phase', () => {
  const source = engineSource();
  const deployCase = source.match(/Deploy\)\s*([\s\S]*?)\n\s*;;/);
  assert.ok(deployCase);

  const deployBody = deployCase[1];
  const restoreIndex = deployBody.indexOf('restore_beta_and_restart');
  const betaGateIndex = deployBody.indexOf('run_gate "$beta_gate"');
  const readOnlyGateIndex = deployBody.indexOf('run_gate "$readonly_gate"');

  assert.ok(readOnlyGateIndex >= 0, 'Deploy must run a read-only gate');
  assert.ok(restoreIndex > readOnlyGateIndex, 'beta restore must follow read-only qualification');
  assert.ok(betaGateIndex > restoreIndex, 'beta gate must follow beta restoration');
});

test('Observe does not mutate and remote payload is streamed over stdin', () => {
  const source = engineSource();
  const observeCase = source.match(/Observe\)\s*([\s\S]*?)\n\s*;;/);
  assert.ok(observeCase);
  assert.doesNotMatch(observeCase[1], /\binstall\b/);
  assert.doesNotMatch(observeCase[1], /systemctl restart/);
  assert.doesNotMatch(observeCase[1], /"\$deploy_helper"/);

  assert.match(source, /Pipe the payload over stdin so even Observe does not create a remote temporary file/);
  assert.match(source, /sudo -n bash -s/);
  assert.doesNotMatch(source, /\bscp\b/);
});

test('known C2-D.1 harness defects are structurally excluded', () => {
  const source = engineSource();
  assert.doesNotMatch(source, /\$Home\s*=/i, 'must never assign PowerShell $HOME/$Home');
  assert.match(source, /public expectations\s+release-specific|public checks are data-driven|PublicChecks/i);
  assert.match(source, /DO_NOT_AUTOMATICALLY_RETRY=YES/);
  assert.match(source, /PRESERVED_BETA_ENV_RETAINED=YES/);
  assert.match(source, /MUTATION_PERFORMED=%s/);
  assert.match(source, /FAIL_CLOSED_READ_ONLY=SKIPPED_NO_MUTATION_IN_THIS_INVOCATION/);
});

test('C2-D.1 binding freezes accepted production identity and boundaries', () => {
  const binding = read(c2d1Path);

  for (const marker of [
    'ba13470f0e79f5704f229774a6c8aacc23e358f4',
    'c953995ccf1eb2cf01d63eb5d0ffedba7f904ef9',
    '5f3fbaea0395f583435d901ccc7faa0801240e7a',
    '08fa1ca6e871f32430550f2a24f7f8788f68a62e',
    'beta-ba13470',
    'beta-5f3fbae',
    '859c5808e16b1fbe273d21f6258099e127f5d9f072bfc5b82bd5957938c284b2',
    'cb8a5895b1d2f06500b5071bc32251b8aa4a3f82f9d138a5806b4c9917ce3868',
    '32539607927',
    'CiRunNumber = 250',
    "Content-Security-Policy",
    "connect-src 'self' https://images.hive.blog",
    'data-c2c1-surface="wallet"',
    'onboarding-not-active-heading',
    "NotContains = @('data-onboarding-customer')",
  ]) {
    assert.ok(binding.includes(marker), `C2-D.1 binding missing ${marker}`);
  }

  const expectedActions = [
    'post', 'comment', 'vote', 'follow', 'unfollow', 'subscribe',
    'unsubscribe', 'profile', 'claim-rewards', 'wall', 'inbox', 'thread',
  ];
  for (const action of expectedActions) {
    assert.ok(binding.includes(`'${action}'`), `missing beta action ${action}`);
  }

  assert.ok(binding.includes("AnyContains = @('class=\"thread-feed\"', 'No threads yet')"));
  assert.ok(binding.includes("Contains = @('/css/c2-d-media.css')"));
  assert.ok(!binding.includes('data-composer-dialog-trigger'));
});


test('library path resolution and public HTTP acquisition are resilient', () => {
  const bindingsLib = read(bindingsLibPath);
  const executionLib = read(executionLibPath);
  const harness = read(harnessPath);
  const remote = read(remoteTemplatePath);

  assert.match(bindingsLib, /Split-Path -Parent \$PSScriptRoot/);
  assert.match(bindingsLib, /Join-Path \$productionRoot 'remote\/production-deploy\.sh\.tmpl'/);
  assert.match(executionLib, /ValidateSet\('Observe', 'Deploy', 'Resume'\).*\$Operation/);
  assert.match(harness, /Invoke-RemotePayload[\s\S]*-Operation \$Operation/);
  assert.match(executionLib, /for \(\$attempt = 1; \$attempt -le 3; \$attempt\+\+\)/);
  assert.match(executionLib, /could not obtain HTTP 200 after 3 attempts/);
  assert.match(executionLib, /PUBLIC_FAILURE_FAIL_CLOSED_READ_ONLY=PASS/);
  assert.match(executionLib, /v\.writeMode===\"disabled\"/);
  assert.match(executionLib, /expected_commit=__EXPECTED_COMMIT__/);
  assert.doesNotMatch(remote, /\. \/etc\/hive-bar\/hive-bar\.env/);
  assert.match(remote, /' sh "\$active_env" "\$current_link" "\$node_path" "\$gate"/);
});

test('generated remote Bash payload template is syntactically valid on Bash hosts', (t) => {
  if (process.platform === 'win32') {
    t.skip('bash syntax validation runs on non-Windows CI lanes');
    return;
  }

  let bash = read(remoteTemplatePath);
  const replacements = new Map([
    ['__OPERATION__', "'Deploy'"],
    ['__SERVICE__', "'hive-bar.service'"],
    ['__HEALTH_TIMER__', "'hive-bar-healthcheck.timer'"],
    ['__DEPLOY_HELPER__', "'/usr/local/sbin/hive-bar-deploy'"],
    ['__CURRENT_LINK__', "'/opt/hive-bar/current'"],
    ['__LAST_GOOD_LINK__', "'/opt/hive-bar/last-good'"],
    ['__RELEASE_ROOT__', "'/opt/hive-bar/releases'"],
    ['__NODE_PATH__', "'/usr/local/bin/node'"],
    ['__ACTIVE_ENV__', "'/etc/hive-bar/hive-bar.env'"],
    ['__READONLY_ENV__', "'/etc/hive-bar/read-only'"],
    ['__PRESERVED_BETA_ENV__', "'/etc/hive-bar/preserved'"],
    ['__BETA_ENV_SHA__', `'${'a'.repeat(64)}'`],
    ['__READONLY_ENV_SHA__', `'${'b'.repeat(64)}'`],
    ['__OLD_COMMIT__', `'${'0'.repeat(40)}'`],
    ['__OLD_TREE__', `'${'1'.repeat(40)}'`],
    ['__OLD_BUILD__', "'beta-old'"],
    ['__NEW_COMMIT__', `'${'2'.repeat(40)}'`],
    ['__NEW_TREE__', `'${'3'.repeat(40)}'`],
    ['__EXPECTED_BUILD__', "'beta-new'"],
    ['__READONLY_GATE__', "'scripts/check-privex-release.js'"],
    ['__BETA_GATE__', "'scripts/check-beta-release.js'"],
    ['__EXPECTED_ACTIONS_CSV__', "'post,comment'"],
    ['__SOURCE_CHECKS__', '  assert_contains "$release_path/example" \'marker\''],
  ]);
  for (const [token, value] of replacements) {
    bash = bash.replaceAll(token, value);
  }
  assert.doesNotMatch(bash, /__[A-Z0-9_]+__/);

  const result = spawnSync('bash', ['-n'], { input: bash, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || 'bash -n failed');
});

test('PowerShell harness and binding files parse when pwsh is available', (t) => {
  const probe = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
    encoding: 'utf8',
  });
  if (probe.error?.code === 'ENOENT') {
    t.skip('pwsh is not installed in this local qualification environment');
    return;
  }
  assert.equal(probe.status, 0, probe.stderr);

  const psHarness = harnessPath.replaceAll("'", "''");
  const psBindingsLib = bindingsLibPath.replaceAll("'", "''");
  const psExecutionLib = executionLibPath.replaceAll("'", "''");
  const psExample = examplePath.replaceAll("'", "''");
  const psC2d1 = c2d1Path.replaceAll("'", "''");
  const command = [
    `foreach ($file in @('${psHarness}','${psBindingsLib}','${psExecutionLib}')) { $tokens=$null; $errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors); if ($errors.Count -ne 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 11 } };`,
    `[void](Import-PowerShellDataFile -LiteralPath '${psExample}');`,
    `[void](Import-PowerShellDataFile -LiteralPath '${psC2d1}');`,
  ].join(' ');
  const result = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-Command', command], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('documentation freezes resume-not-redeploy and separate cleanup governance', () => {
  const doc = read(docPath);
  assert.match(doc, /Never use `Deploy` to finish qualification of a release that is already installed\. Use `Resume`\./);
  assert.match(doc, /preserved beta-environment copy until separately authorized post-acceptance cleanup/i);
  assert.match(doc, /beta-only gate was called while the host was intentionally read-only/i);
  assert.match(doc, /\$Home[\s\S]*\$HOME/i);
});
