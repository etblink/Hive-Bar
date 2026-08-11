'use strict';

const hiveClient = require('../hiveClient');

function fetchCommunityInfo(name) {
  return hiveClient.call('bridge', 'get_community', { name });
}

function fetchCommunityPosts(name, limit = 20, sort = 'trending') {
  return hiveClient.call('bridge', 'get_ranked_posts', { tag: name, limit, sort });
}

module.exports = {
  fetchCommunityInfo,
  fetchCommunityPosts,
};
