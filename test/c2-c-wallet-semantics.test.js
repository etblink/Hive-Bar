'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const request = require('supertest');
const { createFixtureApp } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');
const TEMPLATE = fs.readFileSync(
  path.join(ROOT, 'views', 'pages', 'profile', 'partials', 'user-wallet.ejs'),
  'utf8',
);
const PROFILE = fs.readFileSync(path.join(ROOT, 'views', 'pages', 'profile', 'index.ejs'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'css', 'c2-c-wallet.css'), 'utf8');
const STATIC_ASSETS = fs.readFileSync(
  path.join(ROOT, 'src', 'release', 'static-assets.js'),
  'utf8',
);

function assertPrimaryBeforeSecondary(body, primary, secondary) {
  const primaryIndex = body.indexOf(primary);
  const secondaryIndex = body.indexOf(secondary);
  assert.notEqual(primaryIndex, -1, `missing primary wallet label: ${primary}`);
  assert.notEqual(secondaryIndex, -1, `missing exact Hive label: ${secondary}`);
  assert.ok(primaryIndex < secondaryIndex, `${primary} must precede ${secondary}`);
}

test('C2-C Wallet leads with patron semantics while keeping exact Hive terminology visible', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/etblink/wallet').expect(200);
  const body = response.text;

  assert.match(body, /data-c2c-surface="wallet"/);
  assert.match(body, /Bar wallet/);
  assert.match(body, /Public on Hive/);
  assertPrimaryBeforeSecondary(body, 'Available HBD', 'Liquid HBD');
  assertPrimaryBeforeSecondary(body, 'Available HIVE', 'Liquid HIVE');
  assertPrimaryBeforeSecondary(body, 'Your bar level', 'Hive Power');
  assertPrimaryBeforeSecondary(body, 'Voting strength', 'Voting power');
  assertPrimaryBeforeSecondary(body, 'Activity capacity', 'Resource credits (RC)');
  assertPrimaryBeforeSecondary(body, 'Ready to claim', 'Claimable rewards');
  assert.match(body, /Regular Drinker/);
  assert.match(body, /href="\/faq#wallet"/);
  assert.match(body, /What do these Hive terms mean\?/);
  assert.match(body, /This page only reads public Hive data/);
  assert.match(body, /cannot move funds or access private keys/);
  assert.doesNotMatch(body, /data-m4-action="claim-rewards"/);
});

test('C2-C Wallet presentation continues to bind directly to the accepted exact wallet values', () => {
  for (const expression of [
    'wallet.liquidHbd',
    'wallet.liquidHive',
    'wallet.hivePower',
    'wallet.votingPowerPercent',
    'wallet.resourceCreditsPercent',
    'wallet.milestone.name',
    'wallet.milestone.progressPercent',
    'wallet.rewards.hive',
    'wallet.rewards.hbd',
    'wallet.rewards.hivePower',
  ]) {
    assert.match(TEMPLATE, new RegExp(expression.replaceAll('.', '\\.')));
  }

  assert.match(
    TEMPLATE,
    /canManageProfile && \(writesEnabled \|\| canWriteAction\('claim-rewards'\)\)/,
  );
  assert.match(TEMPLATE, /data-m4-action="claim-rewards"/);
  assert.match(TEMPLATE, /Review reward claim/);
});

test('C2-C Wallet introduces no invented financial capability', () => {
  assert.doesNotMatch(
    TEMPLATE,
    /\b(?:Send HIVE|Send HBD|Transfer funds|Swap|Buy HIVE|Buy HBD|Sell HIVE|Sell HBD|Portfolio total|USD value)\b/i,
  );
  assert.doesNotMatch(TEMPLATE, /data-(?:transfer|swap|buy|sell)-/i);
});

test('C2-C Wallet stylesheet is isolated, registered, local, and presentation-only', () => {
  assert.match(PROFILE, /\/css\/c2-c-wallet\.css/);
  assert.match(STATIC_ASSETS, /'\/css\/c2-c-wallet\.css'/);
  assert.match(CSS, /\.c2c-wallet/);
  assert.match(CSS, /\.c2c-wallet__protocol/);
  assert.match(CSS, /var\(--hb-/);
  assert.doesNotMatch(CSS, /https?:\/\//i);
  assert.doesNotMatch(CSS, /url\s*\(/i);
  assert.doesNotMatch(CSS, /@import/i);
});
