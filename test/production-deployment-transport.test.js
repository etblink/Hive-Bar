'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const executionLibPath = path.join(
  root,
  'scripts',
  'production',
  'lib',
  'HiveBarDeployment.Execution.ps1',
);

const read = (file) => fs.readFileSync(file, 'utf8');

test('SSH payload transport uses exact redirected stdin for both remote execution paths', () => {
  const source = read(executionLibPath);

  assert.match(source, /function ConvertTo-LfBashPayload/);
  assert.match(source, /function Invoke-SshBashPayload/);
  assert.match(source, /RedirectStandardInput = \$true/);
  assert.match(source, /StandardInputEncoding = \$utf8NoBom/);
  assert.match(source, /StandardInput\.Write\(\$payload\)/);
  assert.match(source, /StandardInput\.Close\(\)/);
  assert.doesNotMatch(source, /\$(?:RemoteScript|script)\s*\|\s*&\s*ssh/);
  assert.doesNotMatch(source, /StandardInput\.WriteLine/);

  const calls = source.match(/Invoke-SshBashPayload -RemoteScript/g) || [];
  assert.equal(calls.length, 2, 'normal and fail-closed execution must share the byte-stable transport');
});

test('LF- and CRLF-ended Bash payloads normalize to the same exact bytes in PowerShell', (t) => {
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

  const psExecution = executionLibPath.replaceAll("'", "''");
  const command = [
    `. '${psExecution}';`,
    '$lf = [string]::Join("`n", @("printf \'alpha\\n\'", "printf \'omega\\n\'", ""));',
    '$crlf = $lf.Replace("`n", "`r`n");',
    'foreach ($case in @($lf, $crlf)) {',
    '  $normalized = ConvertTo-LfBashPayload -RemoteScript $case;',
    '  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($normalized));',
    '}',
  ].join(' ');

  const result = spawnSync(
    'pwsh',
    ['-NoLogo', '-NoProfile', '-Command', command],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const expectedPayload = "printf 'alpha\\n'\nprintf 'omega\\n'\n";
  const expectedBase64 = Buffer.from(expectedPayload, 'utf8').toString('base64');
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);

  assert.deepEqual(lines, [expectedBase64, expectedBase64]);
  for (const encoded of lines) {
    const bytes = Buffer.from(encoded, 'base64');
    assert.equal(bytes.includes(0x0d), false, 'normalized Bash stdin must contain no carriage return');
    assert.equal(bytes.at(-1), 0x0a, 'payload must end in exactly its source LF, not an appended record');
  }
});

test('normalized payload executes only its intended commands under Bash', (t) => {
  if (process.platform === 'win32') {
    t.skip('Bash execution assertion runs on non-Windows CI lanes');
    return;
  }

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

  const psExecution = executionLibPath.replaceAll("'", "''");
  const command = [
    `. '${psExecution}';`,
    '$lf = [string]::Join("`n", @("printf \'alpha\\n\'", "printf \'omega\\n\'", ""));',
    '$crlf = $lf.Replace("`n", "`r`n");',
    'foreach ($case in @($lf, $crlf)) {',
    '  $normalized = ConvertTo-LfBashPayload -RemoteScript $case;',
    '  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($normalized));',
    '}',
  ].join(' ');

  const normalized = spawnSync(
    'pwsh',
    ['-NoLogo', '-NoProfile', '-Command', command],
    { encoding: 'utf8' },
  );
  assert.equal(normalized.status, 0, normalized.stderr || normalized.stdout);

  const payloads = normalized.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((encoded) => Buffer.from(encoded, 'base64'));

  for (const payload of payloads) {
    const bash = spawnSync('bash', ['-s'], { input: payload });
    assert.equal(bash.status, 0, bash.stderr?.toString() || 'bash payload failed');
    assert.equal(bash.stdout.toString(), 'alpha\nomega\n');
    assert.equal(bash.stderr.toString(), '');
  }
});
