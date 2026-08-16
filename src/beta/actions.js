'use strict';

const BETA_ACTIONS = Object.freeze([
  'post',
  'comment',
  'vote',
  'wall',
  'inbox',
]);

function isBetaAction(action) {
  return BETA_ACTIONS.includes(String(action || '').trim().toLowerCase());
}

module.exports = {
  BETA_ACTIONS,
  isBetaAction,
};
