'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('C2-B.3 community composer and sort controls share one responsive feed toolbar', () => {
  const community = source('views/pages/community/partials/community-post-list.ejs');
  const focused = source('public/css/c2-b-focused.css');

  assert.match(community, /community-feed-toolbar/);
  assert.match(community, /composer-toolbar/);
  assert.match(community, /class="community-sort"/);
  assert.match(community, /data-community-sort/);
  assert.match(community, /triggerVariant:\s*'icon'/);
  assert.match(focused, /\.community-feed-toolbar \{/);
  assert.match(focused, /\.community-feed-toolbar \.community-sort \{[\s\S]*display:\s*flex/);
  assert.match(focused, /\.community-feed-toolbar \.composer-toolbar \{[\s\S]*order:\s*2/);
});

test('C2-B.3 posts and comments use inline social actions with inert icon Share and direct-child Reply ownership', () => {
  const post = source('views/common/post.ejs');
  const fullPost = source('views/partials/full-post.ejs');
  const comment = source('views/common/comment.ejs');
  const share = source('views/common/share-action.ejs');
  const focused = source('public/css/c2-b-focused.css');
  const c2b3 = source('public/css/c2-b3-social.css');

  assert.match(post, /class="social-action-row"/);
  assert.match(fullPost, /class="social-action-row"/);
  assert.match(comment, /social-action-row social-action-row--comment/);
  assert.ok(comment.indexOf("include('vote-form'") < comment.indexOf("include('composer'"));
  assert.match(comment, /<\/div>\s*<\/div>\s*\n\s*<% if \(hiveSession && canWriteAction\('comment'\)\) \{ %>/);
  assert.match(share, /social-action-button--share/);
  assert.match(share, /social-action-button__glyph/);
  assert.doesNotMatch(share, /<svg\b/);
  assert.doesNotMatch(share, />\s*Share\s*</);
  assert.match(focused, /\.social-action-row \{/);
  assert.match(c2b3, /\.comment-card\.social-comment \{[\s\S]*display:\s*grid/);
  assert.match(c2b3, /\.social-comment__activity \{[\s\S]*display:\s*contents/);
  assert.match(c2b3, /\.social-comment > \.composer--dialog-launcher \{/);
});

test('C2-B.3 root Reply stays lightweight but becomes visibly interactive', () => {
  const fullPost = source('views/partials/full-post.ejs');
  const focused = source('public/css/c2-b-focused.css');

  assert.match(fullPost, /variant:\s*'root-reply'/);
  assert.match(fullPost, /triggerLabel:\s*'Post your reply'/);
  assert.match(focused, /\.composer--root-reply \{[\s\S]*border:\s*1px solid/);
  assert.match(focused, /\.composer--root-reply \.composer__dialog-trigger--social::before/);
});

test('C2-B.3 Wall uses the orange plus language and defers fee emphasis toward review without merging actions', () => {
  const wall = source('views/pages/profile/partials/wall-posts.ejs');
  const m4 = source('public/js/m4-actions.js');

  assert.match(wall, /triggerVariant:\s*'icon'/);
  assert.match(wall, /wall-compose-toolbar/);
  assert.match(wall, /Leave a message for @<%= userProfile\.name %>/);
  assert.match(wall, /Posting a wall message costs at least/);
  assert.match(wall, /submitLabel:\s*privateOnly \? 'Review private message' : 'Review Wall post'/);
  assert.match(wall, /The message, sender, recipient, payment, and transaction are permanently public on Hive/);
  assert.match(wall, /review the recipient, message, fee, and payment before Keychain asks for approval/i);
  assert.match(wall, /action:\s*privateOnly \? 'inbox' : 'wall'/);
  assert.match(wall, /expectedFee/);
  assert.match(wall, /amount/);
  assert.match(m4, /if \(action === 'wall'\)/);
  assert.match(m4, /if \(action === 'inbox'\)/);
  assert.match(m4, /adapter\.encodeMemo/);
});

test('C2-B.3 Inbox presents a recognizable message-list hierarchy while keeping local Keychain decryption', () => {
  const inbox = source('views/pages/profile/partials/inbox.ejs');
  const messages = source('public/css/ux-1e-messages.css');
  const c2b3 = source('public/css/c2-b3-social.css');

  assert.match(inbox, /id="inbox-heading"[^>]*>Inbox</);
  assert.match(inbox, /Your encrypted inbox/);
  assert.match(inbox, /Messages are stored on Hive as encrypted text/);
  assert.match(inbox, /inbox-privacy-state/);
  assert.match(inbox, /message-entry__inbox-state/);
  assert.match(inbox, />Encrypted</);
  assert.match(inbox, /data-inbox-ciphertext/);
  assert.match(inbox, />\s*Open message\s*</);
  assert.match(inbox, /Decrypt with Keychain/);
  assert.doesNotMatch(inbox, /<svg\b/);
  assert.match(inbox, /Hive Keychain uses your Memo key in this browser/);
  assert.match(inbox, /decrypted message is not sent back to Hive-Bar/);
  assert.match(inbox, /Wall fee ·/);
  assert.match(messages, /\.message-entry__decrypt \{[\s\S]*background:\s*transparent/);
  assert.match(messages, /\.message-entry__activity--inbox/);
  assert.match(messages, /:has\(\.message-entry__body--private:not\(\[hidden\]\)\) \.message-entry__inbox-state/);
  assert.match(c2b3, /\.message-entry__open-glyph/);
});

test('C2-B.3 additive CSS is versioned and loaded after prior interaction layers', () => {
  const assets = source('src/release/static-assets.js');
  const community = source('views/pages/community/index.ejs');
  const post = source('views/pages/post/index.ejs');
  const profile = source('views/pages/profile/index.ejs');

  assert.match(assets, /'\/css\/c2-b3-social\.css'/);
  assert.match(community, /assetUrl\('\/css\/c2-b3-social\.css'\)/);
  assert.match(post, /assetUrl\('\/css\/c2-b3-social\.css'\)/);
  assert.match(profile, /assetUrl\('\/css\/c2-b3-social\.css'\)/);
  assert.ok(profile.indexOf('/css/ux-1e-messages.css') < profile.indexOf('/css/c2-b3-social.css'));
});
