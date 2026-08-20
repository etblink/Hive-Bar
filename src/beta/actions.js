'use strict';

const BETA_ACTIONS = Object.freeze([
  'post',
  'comment',
  'vote',
  'follow',
  'unfollow',
  'subscribe',
  'unsubscribe',
  'claim-rewards',
  'wall',
  'inbox',
  'thread',
]);

function isBetaAction(action) {
  return BETA_ACTIONS.includes(String(action || '').trim().toLowerCase());
}

module.exports = {
  BETA_ACTIONS,
  isBetaAction,
};
