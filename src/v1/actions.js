'use strict';

const V1_POSTING_ACTIONS = Object.freeze([
  'post',
  'thread',
  'comment',
  'vote',
  'follow',
  'unfollow',
  'subscribe',
  'unsubscribe',
  'profile',
]);

const V1_ACTIVE_ACTIONS = Object.freeze(['wall', 'inbox']);
const V1_ACTIONS = Object.freeze([...V1_POSTING_ACTIONS, ...V1_ACTIVE_ACTIONS]);

function isV1Action(action) {
  return V1_ACTIONS.includes(String(action || '').trim().toLowerCase());
}

module.exports = {
  V1_ACTIONS,
  V1_ACTIVE_ACTIONS,
  V1_POSTING_ACTIONS,
  isV1Action,
};
