'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { HP_MILESTONES, getHivePowerMilestone } = require('../src/hive/milestones');
const {
  calculateWalletSummary,
  regeneratedPercent,
} = require('../src/hive/wallet');
const fixture = require('./fixtures/hive/m2-read-slice.json');

const NOW_MS = Date.parse('2026-08-11T12:00:00Z');

test('calculates HP, regenerated mana, balances, and rewards from a fixed reference snapshot', () => {
  const wallet = calculateWalletSummary(
    fixture.accounts[0],
    fixture.globalProperties,
    fixture.rcAccounts,
    { nowMs: NOW_MS },
  );

  assert.equal(wallet.liquidHive, 12.345);
  assert.equal(wallet.liquidHbd, 6.789);
  assert.equal(wallet.hivePower, 550);
  assert.equal(wallet.resourceCreditsPercent, 60);
  assert.equal(wallet.votingPowerPercent, 70);
  assert.equal(wallet.beerSegmentsFilled, 7);
  assert.equal(wallet.rewards.hive, 1);
  assert.equal(wallet.rewards.hbd, 0.5);
  assert.equal(wallet.rewards.hivePower, 0.5);
  assert.equal(wallet.hasClaimableRewards, true);
  assert.equal(wallet.displayedAt, '2026-08-11T12:00:00.000Z');
});

test('mana regeneration clamps invalid, negative, and over-full values', () => {
  assert.equal(
    regeneratedPercent({ currentMana: -100, maxMana: 100, lastUpdateSeconds: 0, nowSeconds: 0 }),
    0,
  );
  assert.equal(
    regeneratedPercent({ currentMana: 100, maxMana: 100, lastUpdateSeconds: 0, nowSeconds: 999999 }),
    100,
  );
  assert.equal(
    regeneratedPercent({ currentMana: 1, maxMana: 0, lastUpdateSeconds: 0, nowSeconds: 1 }),
    0,
  );
});

test('keeps the original beer-themed HP thresholds in one tested ordered table', () => {
  assert.equal(Object.isFrozen(HP_MILESTONES), true);
  assert.equal(HP_MILESTONES[0].min, 0);
  assert.equal(HP_MILESTONES.at(-1).max, Number.POSITIVE_INFINITY);

  for (let index = 1; index < HP_MILESTONES.length; index += 1) {
    assert.equal(HP_MILESTONES[index - 1].max, HP_MILESTONES[index].min);
  }

  assert.deepEqual(
    { name: getHivePowerMilestone(550).name, progress: getHivePowerMilestone(550).progressPercent },
    { name: 'Regular Drinker', progress: 10 },
  );
  assert.equal(getHivePowerMilestone(1_500_000).progressPercent, 100);
});
