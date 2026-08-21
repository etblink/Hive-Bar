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
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'css', 'c2-c-wallet.css'), 'utf8');

function indexOrFail(body, marker) {
  const index = body.indexOf(marker);
  assert.notEqual(index, -1, `missing C2-C.1 marker: ${marker}`);
  return index;
}

test('C2-C.1 Wallet makes bar status the spatial hero before participation, balances, and rewards', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/etblink/wallet').expect(200);
  const body = response.text;

  assert.match(body, /data-c2c1-surface="wallet"/);
  const status = indexOrFail(body, 'data-c2c1-region="status"');
  const participation = indexOrFail(body, 'data-c2c1-region="participation"');
  const balances = indexOrFail(body, 'data-c2c1-region="balances"');
  const rewards = indexOrFail(body, 'data-c2c1-region="rewards"');

  assert.ok(status < participation, 'bar status must lead participation');
  assert.ok(participation < balances, 'participation must lead balances');
  assert.ok(balances < rewards, 'balances must lead rewards');

  assert.match(body, /Your bar level/);
  assert.match(body, /Regular Drinker/);
  assert.match(body, /Voting strength/);
  assert.match(body, /Your pitcher/);
  assert.match(body, /Activity capacity/);
  assert.match(body, /Room to participate/);
  assert.match(body, /Available HBD/);
  assert.match(body, /Available HIVE/);
  assert.match(body, /Ready to claim/);
});

test('C2-C.1 preserves C2-C exact Hive terminology and direct value bindings', () => {
  for (const term of [
    'Liquid HBD',
    'Liquid HIVE',
    'Hive Power',
    'Voting power',
    'Resource credits (RC)',
    'Claimable rewards',
  ]) {
    assert.match(TEMPLATE, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

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

  assert.match(TEMPLATE, /wallet\.beerSegmentsFilled/);
  assert.match(TEMPLATE, /wallet\.milestone\.hasNextLevel/);
  assert.match(TEMPLATE, /wallet\.milestone\.max\.toLocaleString\(\)/);
});

test('C2-C.1 demotes explanatory material without removing the accepted read-only and Keychain boundaries', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/etblink/wallet').expect(200);
  const body = response.text;

  assert.match(body, /<details class="c2c1-wallet-disclosure">/);
  assert.match(body, /How this wallet works/);
  assert.match(body, /This page only reads public Hive data/);
  assert.match(body, /cannot move funds or access private keys/);
  assert.match(body, /reviewed in Keychain before it happens/);
  assert.match(body, /href="\/faq#wallet"/);
  assert.match(body, /What do these Hive terms mean\?/);
});

test('C2-C.1 keeps the exact reward-claim gate and introduces no new financial action', () => {
  assert.match(
    TEMPLATE,
    /canManageProfile && \(writesEnabled \|\| canWriteAction\('claim-rewards'\)\)/,
  );
  assert.match(TEMPLATE, /data-m4-action="claim-rewards"/);
  assert.match(TEMPLATE, /Review reward claim/);
  assert.match(TEMPLATE, /checks your current rewards again before Keychain asks for approval/i);
  assert.doesNotMatch(
    TEMPLATE,
    /\b(?:Send HIVE|Send HBD|Transfer funds|Swap|Buy HIVE|Buy HBD|Sell HIVE|Sell HBD|Portfolio total|USD value)\b/i,
  );
  assert.doesNotMatch(TEMPLATE, /data-(?:transfer|swap|buy|sell)-/i);
});

test('C2-C.1 human-review remediation makes the pitcher compact and unmistakably glass-shaped', () => {
  assert.match(CSS, /\.c2c1-pitcher\s*\{[\s\S]*?width:\s*5\.4rem;/);
  assert.match(CSS, /\.c2c1-pitcher\s*\{[\s\S]*?min-height:\s*7\.35rem;/);
  assert.match(CSS, /\.c2c1-pitcher\s*\{[\s\S]*?transform:\s*none;/);
  assert.match(CSS, /\.c2c1-pitcher::after\s*\{[\s\S]*?border-left:\s*0;/);
  assert.match(CSS, /\.c2c1-pitcher \.beer-segments\s*\{[\s\S]*?gap:\s*0;/);
  assert.doesNotMatch(CSS, /\.c2c1-status-hero::after/);
  assert.doesNotMatch(CSS, /transform:\s*scale\(/);
});

test('C2-C.1 human-review remediation keeps tablet/mobile participation stacked and content clear of the fixed nav', () => {
  assert.match(CSS, /@media \(min-width:\s*960px\)[\s\S]*?\.c2c1-participation-stage\s*\{[\s\S]*?grid-template-columns:/);
  assert.doesNotMatch(CSS, /@media \(min-width:\s*720px\)/);
  assert.match(CSS, /@media \(max-width:\s*1199px\)[\s\S]*?padding-bottom:\s*calc\(6\.5rem \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(CSS, /@media \(max-width:\s*639px\)[\s\S]*?\.c2c1-pour\s*\{[\s\S]*?grid-template-columns:\s*6rem minmax\(0, 1fr\)/);
  assert.match(CSS, /\.c2c1-status-hero__progress-label\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(
    CSS,
    /@media \(max-width:\s*639px\)[\s\S]*?\.c2c1-status-hero__progress-label[\s\S]*?flex-direction:\s*column/,
  );
});

test('C2-C.1 human-review remediation makes Activity capacity state primary and RC inspectable', () => {
  assert.match(TEMPLATE, /class="c2c1-capacity__state"/);
  assert.match(TEMPLATE, /class="c2c1-capacity__marks"/);
  assert.match(TEMPLATE, /activityMarksFilled/);
  assert.match(TEMPLATE, /<details class="c2c1-capacity__protocol-detail">/);
  assert.match(TEMPLATE, /% RC<\/summary>/);
  assert.match(TEMPLATE, /Resource credits \(RC\)/);
  assert.doesNotMatch(TEMPLATE, /c2c1-capacity-meter/);
});

test('C2-C.1 stylesheet remains scoped, token-driven, local, and presentation-only', () => {
  assert.match(CSS, /\.c2c1-status-hero/);
  assert.match(CSS, /\.c2c1-participation-stage/);
  assert.match(CSS, /\.c2c1-pour/);
  assert.match(CSS, /\.c2c1-capacity/);
  assert.match(CSS, /\.c2c1-balances/);
  assert.match(CSS, /\.c2c1-rewards/);
  assert.match(CSS, /var\(--hb-/);
  assert.doesNotMatch(CSS, /https?:\/\//i);
  assert.doesNotMatch(CSS, /url\s*\(/i);
  assert.doesNotMatch(CSS, /@import/i);
});
