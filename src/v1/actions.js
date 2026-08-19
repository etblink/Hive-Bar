'use strict';

const V1_SOCIAL_ACTIONS = Object.freeze([
  'post',
  'thread',
  'comment',
  'vote',
  'follow',
  'unfollow',
  'subscribe',
  'unsubscribe',
]);

const V1_M4_POSTING_ACTIONS = Object.freeze(['profile', 'claim-rewards']);
const V1_ACTIVE_ACTIONS = Object.freeze(['wall', 'inbox']);
const V1_POSTING_ACTIONS = Object.freeze([...V1_SOCIAL_ACTIONS, ...V1_M4_POSTING_ACTIONS]);
const V1_M4_ACTIONS = Object.freeze([...V1_M4_POSTING_ACTIONS, ...V1_ACTIVE_ACTIONS]);
const V1_ACTIONS = Object.freeze([...V1_POSTING_ACTIONS, ...V1_ACTIVE_ACTIONS]);

function normalizeAction(action) {
  return String(action || '').trim().toLowerCase();
}

function isV1Action(action) {
  return V1_ACTIONS.includes(normalizeAction(action));
}

function isV1SocialAction(action) {
  return V1_SOCIAL_ACTIONS.includes(normalizeAction(action));
}

function isV1M4Action(action) {
  return V1_M4_ACTIONS.includes(normalizeAction(action));
}

module.exports = {
  V1_ACTIONS,
  V1_ACTIVE_ACTIONS,
  V1_M4_ACTIONS,
  V1_M4_POSTING_ACTIONS,
  V1_POSTING_ACTIONS,
  V1_SOCIAL_ACTIONS,
  isV1Action,
  isV1M4Action,
  isV1SocialAction,
};
