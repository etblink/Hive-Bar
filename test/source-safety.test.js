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

  for (const filename of filesUnder(viewsDirectory).filter((file) => file.endsWith('.ejs'))) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /\son[a-z]+\s*=/i, `${filename} contains an inline event handler`);
    assert.doesNotMatch(
      source,
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
  for (const filename of filesUnder(browserDirectory).filter((file) => file.endsWith('.js'))) {
    const source = fs.readFileSync(filename, 'utf8');
    assert.doesNotMatch(source, /\blocalStorage\b|\bsessionStorage\b|document\.cookie/i, filename);
    assert.doesNotMatch(source, /\bprivateKey\b|private_key|\bwif\b/i, filename);
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
