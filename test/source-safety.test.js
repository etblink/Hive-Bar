'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
  });
}

test('EJS templates contain no inline event handlers or executable inline scripts', () => {
  const viewsDirectory = path.join(__dirname, '..', 'views');
  const onboardingTemplate = path.join(viewsDirectory, 'pages', 'onboarding', 'index.ejs');
  const importMapPattern = /<script type="importmap"><%- onboardingImportMap %><\/script>/g;

  for (const filename of filesUnder(viewsDirectory).filter((file) => file.endsWith('.ejs'))) {
    const source = fs.readFileSync(filename, 'utf8');
    const importMaps = source.match(importMapPattern) || [];
    assert.equal(importMaps.length, filename === onboardingTemplate ? 1 : 0, filename);
    const executableSource = source.replace(importMapPattern, '');
    assert.doesNotMatch(executableSource, /\son[a-z]+\s*=/i, `${filename} contains an inline event handler`);
    assert.doesNotMatch(
      executableSource,
      /<script(?![^>]*\bsrc=)/i,
      `${filename} contains an executable inline script`,
    );
  }
});

test('legacy browser-side write and key modules are absent', () => {
  const root = path.join(__dirname, '..');
  const removed = [
    'public/js/login.js',
    'public/js/voting.js',
    'public/js/comment.js',
    'public/js/beer-mug-upvote.js',
    'public/js/beer-pitcher-display.js',
    'public/js/db.js',
    'public/js/database.js',
  ];

  for (const relativePath of removed) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} must stay removed`);
  }
});

test('M3 identity and social clients never derive identity from browser storage', () => {
  const browserDirectory = path.join(__dirname, '..', 'public', 'js');
  const onboardingCustomer = path.join(browserDirectory, 'onboarding-customer.js');
  for (const filename of filesUnder(browserDirectory).filter((file) => file.endsWith('.js'))) {
    const source = fs.readFileSync(filename, 'utf8');
    if (filename !== onboardingCustomer) {
      assert.doesNotMatch(source, /\blocalStorage\b|\bsessionStorage\b|document\.cookie/i, filename);
      assert.doesNotMatch(source, /\bprivateKey\b|private_key|\bwif\b/i, filename);
    }
  }

  const onboardingSource = fs.readFileSync(onboardingCustomer, 'utf8');
  assert.match(onboardingSource, /window\.crypto\.getRandomValues\(/);
  assert.match(onboardingSource, /PrivateKey\.fromLogin\(username, masterPassword, role\)/);
  assert.match(onboardingSource, /publicKeys:\s*publicKeys\(credentials\)/);
  assert.doesNotMatch(onboardingSource, /\blocalStorage\b|document\.cookie/i, onboardingCustomer);
  assert.match(onboardingSource, /window\.sessionStorage\.(?:setItem|getItem|removeItem)\(/);

  const trackingWriter = onboardingSource.match(/function saveTracking\(value\) \{([\s\S]*?)\n  \}/u)?.[1];
  assert.ok(trackingWriter, 'onboarding customer must retain one explicit sessionStorage tracking writer');
  assert.match(trackingWriter, /window\.sessionStorage\.setItem\(TRACKING_KEY/);
  for (const field of ['idempotencyKey', 'requestId', 'username', 'staffUrl', 'statusUrl']) {
    assert.match(trackingWriter, new RegExp(`${field}:`), `tracking writer must retain ${field}`);
  }
  for (const forbidden of ['masterPassword', 'privateKey', 'publicKeys', 'derived', 'credentials']) {
    assert.doesNotMatch(trackingWriter, new RegExp(forbidden, 'i'), `tracking writer must not persist ${forbidden}`);
  }
});

test('server sources contain no private-key or Hive broadcast implementation', () => {
  const root = path.join(__dirname, '..');
  const serverFiles = [
    ...filesUnder(path.join(root, 'src')),
    ...filesUnder(path.join(root, 'routes')),
  ].filter((file) => file.endsWith('.js'));

  for (const filename of serverFiles) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /\bPrivateKey\b|broadcast_transaction|network_broadcast_api/, filename);
    assert.doesNotMatch(source, /requestBroadcast/i, filename);
  }
});