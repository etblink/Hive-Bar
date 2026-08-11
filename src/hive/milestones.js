'use strict';

const HP_MILESTONES = Object.freeze([
  Object.freeze({ min: 0, max: 10, name: 'Bar Visitor', icon: '🍺' }),
  Object.freeze({ min: 10, max: 50, name: 'Local Patron', icon: '🍻' }),
  Object.freeze({ min: 50, max: 200, name: 'Barfly', icon: '🍺' }),
  Object.freeze({ min: 200, max: 500, name: "Bartender's Friend", icon: '🍻' }),
  Object.freeze({ min: 500, max: 1_000, name: 'Regular Drinker', icon: '🛢️' }),
  Object.freeze({ min: 1_000, max: 5_000, name: 'Top Shelf Drinker', icon: '👑' }),
  Object.freeze({ min: 5_000, max: 10_000, name: 'Bar Manager', icon: '🎯' }),
  Object.freeze({ min: 10_000, max: 50_000, name: 'Master Brewer', icon: '🏺' }),
  Object.freeze({ min: 50_000, max: 100_000, name: 'Bar Owner', icon: '🏪' }),
  Object.freeze({ min: 100_000, max: 500_000, name: 'Distillery Owner', icon: '🏭' }),
  Object.freeze({ min: 500_000, max: 1_000_000, name: 'King of the Bar', icon: '👑' }),
  Object.freeze({ min: 1_000_000, max: Number.POSITIVE_INFINITY, name: 'God of the Bar', icon: '⚡' }),
]);

function getHivePowerMilestone(value) {
  const hivePower = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const milestone =
    HP_MILESTONES.find((candidate) => hivePower >= candidate.min && hivePower < candidate.max) ||
    HP_MILESTONES[0];
  const hasNextLevel = Number.isFinite(milestone.max);
  const progressPercent = hasNextLevel
    ? Math.min(100, Math.max(0, ((hivePower - milestone.min) / (milestone.max - milestone.min)) * 100))
    : 100;

  return {
    ...milestone,
    hasNextLevel,
    progressPercent,
  };
}

module.exports = { HP_MILESTONES, getHivePowerMilestone };
