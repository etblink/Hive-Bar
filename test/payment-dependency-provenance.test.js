'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('binds the exact M5 decoder, compatibility patch, scanner, and runtime provenance', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lockfile = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const patch = fs.readFileSync(path.join(root, 'patches', 'hive-uri+0.2.8.patch'));

  assert.equal(packageJson.engines.node, '>=24.15 <25');
  assert.equal(packageJson.dependencies['hive-uri'], '0.2.8');
  assert.equal(packageJson.dependencies['@zxing/browser'], '0.2.1');
  assert.equal(packageJson.dependencies['patch-package'], '8.0.1');
  assert.equal(packageJson.scripts.postinstall, 'patch-package');
  assert.equal(lockfile.packages['node_modules/hive-uri'].version, '0.2.8');
  assert.equal(
    lockfile.packages['node_modules/hive-uri'].integrity,
    'sha512-z04c+XiIxn8LmLyZD/26T5vBhR+EptIIxTnQYu5sODMskY1SjkpVZr6QaHb+6N4vWGVuOtLnK1A89NfyJ7OFfA==',
  );
  assert.equal(lockfile.packages['node_modules/@zxing/browser'].version, '0.2.1');
  assert.equal(
    createHash('sha256').update(patch).digest('hex'),
    'e68145d75b25e660098569dc5c8211898cc680ea7f0f8a8e5ee5022be0b7fe8b',
  );
});

test('applies the pinned dependency patch explicitly after script-disabled CI installs', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
  const installAndPatch = [
    '      - name: Install locked dependencies',
    '        run: npm ci --ignore-scripts --no-fund',
    '',
    '      - name: Apply pinned dependency patch',
    '        run: npx --no-install patch-package',
  ].join('\n');

  assert.equal(workflow.split(installAndPatch).length - 1, 2);
});
