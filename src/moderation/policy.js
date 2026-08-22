'use strict';

function contentKey(item) {
  return `${String(item?.author || '')}/${String(item?.permlink || '')}`;
}

function createModerationPolicy(snapshot = {}) {
  const hiddenAccounts = new Set(Array.isArray(snapshot.accounts) ? snapshot.accounts : []);
  const hiddenContent = new Set(
    (Array.isArray(snapshot.content) ? snapshot.content : []).map((item) => contentKey(item)),
  );

  return Object.freeze({
    hiddenAccounts,
    hiddenContent,
    isHidden(item) {
      const author = String(item?.author || '');
      return hiddenAccounts.has(author) || hiddenContent.has(contentKey(item));
    },
  });
}

function isCommunityRoot(post, communityId) {
  return Boolean(
    post &&
      post.parentAuthor === '' &&
      post.parentPermlink === communityId,
  );
}

function filterDiscussionBranches(discussion, policy, { protectRoot = false } = {}) {
  if (!discussion?.post) return discussion;
  const comments = Array.isArray(discussion.comments) ? discussion.comments : [];
  const rootKey = contentKey(discussion.post);
  const byKey = new Map(comments.map((comment) => [contentKey(comment), comment]));
  const memo = new Map();

  function isSuppressed(comment, seen = new Set()) {
    const key = contentKey(comment);
    if (memo.has(key)) return memo.get(key);
    if (policy.isHidden(comment)) {
      memo.set(key, true);
      return true;
    }
    if (seen.has(key)) {
      memo.set(key, false);
      return false;
    }
    seen.add(key);
    const parentKey = `${comment.parentAuthor}/${comment.parentPermlink}`;
    if (parentKey === rootKey) {
      const hidden = !protectRoot && policy.isHidden(discussion.post);
      memo.set(key, hidden);
      return hidden;
    }
    const parent = byKey.get(parentKey);
    const hidden = parent ? isSuppressed(parent, seen) : false;
    memo.set(key, hidden);
    return hidden;
  }

  return {
    post: discussion.post,
    comments: comments.filter((comment) => !isSuppressed(comment)),
  };
}

module.exports = {
  contentKey,
  createModerationPolicy,
  filterDiscussionBranches,
  isCommunityRoot,
};
