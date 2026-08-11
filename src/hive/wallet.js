'use strict';

const { getHivePowerMilestone } = require('./milestones');

const MANA_REGENERATION_SECONDS = 5 * 24 * 60 * 60;

function assetNumber(value) {
  const number = Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(number) ? number : 0;
}

function regeneratedPercent({ currentMana, maxMana, lastUpdateSeconds, nowSeconds }) {
  if (!(maxMana > 0) || !Number.isFinite(currentMana) || !Number.isFinite(lastUpdateSeconds)) return 0;
  const elapsed = Math.max(0, nowSeconds - lastUpdateSeconds);
  const regenerated = (elapsed * maxMana) / MANA_REGENERATION_SECONDS;
  const current = Math.min(maxMana, Math.max(0, currentMana + regenerated));
  return (current / maxMana) * 100;
}

function votingPowerPercent(account, effectiveVests, nowMs) {
  const nowSeconds = Math.floor(nowMs / 1000);
  const mana = account?.voting_manabar;
  if (mana && Number.isFinite(Number(mana.current_mana)) && Number.isFinite(Number(mana.last_update_time))) {
    return regeneratedPercent({
      currentMana: Number(mana.current_mana),
      maxMana: effectiveVests * 1_000_000,
      lastUpdateSeconds: Number(mana.last_update_time),
      nowSeconds,
    });
  }

  const storedPower = Number(account?.voting_power);
  const lastVoteTime = String(account?.last_vote_time || '');
  const lastVoteMs = Date.parse(lastVoteTime.endsWith('Z') ? lastVoteTime : `${lastVoteTime}Z`);
  if (!Number.isFinite(storedPower) || !Number.isFinite(lastVoteMs)) return 0;
  const elapsedSeconds = Math.max(0, nowMs - lastVoteMs) / 1000;
  return Math.min(10_000, storedPower + (elapsedSeconds * 10_000) / MANA_REGENERATION_SECONDS) / 100;
}

function calculateWalletSummary(account, globalProperties, rcResult, { nowMs = Date.now() } = {}) {
  const ownVests = assetNumber(account?.vesting_shares);
  const receivedVests = assetNumber(account?.received_vesting_shares);
  const delegatedVests = assetNumber(account?.delegated_vesting_shares);
  const effectiveVests = Math.max(0, ownVests + receivedVests - delegatedVests);
  const totalVestingFund = assetNumber(globalProperties?.total_vesting_fund_hive);
  const totalVestingShares = assetNumber(globalProperties?.total_vesting_shares);
  const vestsToHive = totalVestingShares > 0 ? totalVestingFund / totalVestingShares : 0;
  const hivePower = effectiveVests * vestsToHive;

  const rcAccount = rcResult?.rc_accounts?.[0];
  const rcPercent = rcAccount
    ? regeneratedPercent({
        currentMana: Number(rcAccount.rc_manabar?.current_mana),
        maxMana: Number(rcAccount.max_rc),
        lastUpdateSeconds: Number(rcAccount.rc_manabar?.last_update_time),
        nowSeconds: Math.floor(nowMs / 1000),
      })
    : 0;
  const votingPercent = votingPowerPercent(account, effectiveVests, nowMs);

  const rewardVests = assetNumber(account?.reward_vesting_balance);
  const reportedRewardHivePower = assetNumber(account?.reward_vesting_hive);
  const rewardHivePower = reportedRewardHivePower || rewardVests * vestsToHive;
  const rewards = {
    hive: assetNumber(account?.reward_hive_balance),
    hbd: assetNumber(account?.reward_hbd_balance),
    hivePower: rewardHivePower,
    vestingShares: rewardVests,
  };

  return {
    account: account?.name || '',
    displayedAt: new Date(nowMs).toISOString(),
    liquidHive: assetNumber(account?.balance),
    liquidHbd: assetNumber(account?.hbd_balance),
    hivePower,
    resourceCreditsPercent: rcPercent,
    votingPowerPercent: votingPercent,
    beerSegmentsFilled: Math.round(Math.min(100, Math.max(0, votingPercent)) / 10),
    milestone: getHivePowerMilestone(hivePower),
    rewards,
    hasClaimableRewards: rewards.hive > 0 || rewards.hbd > 0 || rewards.vestingShares > 0,
  };
}

module.exports = {
  MANA_REGENERATION_SECONDS,
  assetNumber,
  calculateWalletSummary,
  regeneratedPercent,
  votingPowerPercent,
};
