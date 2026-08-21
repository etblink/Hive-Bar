'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('C2-B.2 nested and root Reply launchers are quiet button-based dialog affordances', () => {
  const comment = source('views/common/comment.ejs');
  const fullPost = source('views/partials/full-post.ejs');
  const composer = source('views/common/composer.ejs');

  assert.doesNotMatch(comment, /dialogDetails:\s*true/);
  assert.match(comment, /triggerVariant:\s*'social'/);
  assert.match(comment, /triggerLabel:\s*'Reply'/);
  assert.match(fullPost, /variant:\s*'root-reply'/);
  assert.match(fullPost, /triggerLabel:\s*'Post your reply'/);
  assert.match(fullPost, /triggerVariant:\s*'social'/);
  assert.match(composer, /composer__dialog-trigger--social/);
});

test('C2-B.2 Wall public/private context stays coherent while retaining existing wall and inbox actions', () => {
  const wall = source('views/pages/profile/partials/wall-posts.ejs');
  const composer = source('views/common/composer.ejs');
  const presentation = source('public/js/composer-presentation.js');
  const m4 = source('public/js/m4-actions.js');

  assert.match(wall, /action:\s*privateOnly \? 'inbox' : 'wall'/);
  assert.match(wall, /kicker:\s*privateOnly \? 'Private message' : 'Wall message'/);
  assert.match(wall, /wallPrivacy:\s*\{ wallEnabled, inboxEnabled \}/);
  assert.match(composer, /data-wall-privacy-kicker/);
  assert.match(presentation, /\[data-wall-privacy-kicker\]/);
  assert.match(presentation, /privateMode \? 'Private message' : 'Wall message'/);
  assert.match(m4, /if \(action === 'wall'\)/);
  assert.match(m4, /if \(action === 'inbox'\)/);
  assert.match(m4, /adapter\.encodeMemo/);
});

test('C2-B.2 presentation layer tightens density without shrinking accessible action targets', () => {
  const focused = source('public/css/c2-b-focused.css');
  const messages = source('public/css/ux-1e-messages.css');

  assert.match(focused, /composer__dialog-trigger--social/);
  assert.match(focused, /min-height:\s*44px/);
  assert.match(focused, /grid-template-columns:\s*minmax\(0, 46rem\) minmax\(17rem, 20rem\)/);
  assert.match(focused, /composer-dialog \{[\s\S]*width:\s*min\(36rem/);
  assert.match(focused, /social-comment__stats \.text-bar-gold/);
  assert.match(messages, /:has\(\.message-entry__body--private:not\(\[hidden\]\)\) \.message-entry__decrypt/);
  assert.match(messages, /display:\s*none/);
});
