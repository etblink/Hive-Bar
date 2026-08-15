'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const request = require('supertest');
const { createFixtureApp } = require('./support/test-app');

const ROOT = path.join(__dirname, '..');
const SOCIAL_CSS = fs.readFileSync(path.join(ROOT, 'public', 'css', 'm15-social.css'), 'utf8');
const COMMUNITY_POSTS_SOURCE = fs.readFileSync(
  path.join(ROOT, 'views', 'pages', 'community', 'partials', 'community-post-list.ejs'),
  'utf8',
);
const FULL_POST_SOURCE = fs.readFileSync(path.join(ROOT, 'views', 'partials', 'full-post.ejs'), 'utf8');
const PROFILE_INFO_SOURCE = fs.readFileSync(
  path.join(ROOT, 'views', 'pages', 'profile', 'partials', 'profile-info-card.ejs'),
  'utf8',
);

function documentFor(html) {
  return new JSDOM(html).window.document;
}

test('M15.3 Home is feed-first, venue-led, and uses only current capabilities', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/').expect(200);
  const document = documentFor(response.text);

  const main = document.querySelector('main[data-m15-surface="home"]');
  assert.ok(main);
  assert.ok(main.querySelector('.social-home-hero'));
  assert.ok(main.querySelector('.social-home-feed'));
  assert.equal(main.querySelector('.social-home-hero__logo')?.getAttribute('src'), '/images/fourth-street-bar-logo.jpg');
  assert.match(main.querySelector('h1')?.textContent || '', /4th Street Bar/);

  const links = Array.from(document.querySelectorAll('head link[rel="stylesheet"]')).map((link) => link.getAttribute('href'));
  assert.deepEqual(links, ['/css/style.css', '/css/m15-social.css']);

  const children = Array.from(main.children);
  const feedIndex = children.findIndex((element) => element.classList.contains('social-home-feed'));
  const visitIndex = children.findIndex((element) => element.id === 'visit');
  assert.ok(feedIndex >= 0);
  assert.ok(visitIndex > feedIndex);

  assert.doesNotMatch(main.textContent, /\bLive\b|\bEvents?\b|\bNearby\b|\bFor You\b/);
  assert.equal(main.querySelector('input[type="search"]'), null);
  assert.doesNotMatch(response.text, /<svg\b/i);
});

test('M15.3 Community prioritizes the feed while preserving exact current tabs and write gating', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/community').expect(200);
  const document = documentFor(response.text);

  const main = document.querySelector('main');
  const surface = document.querySelector('[data-m15-surface="community"]');
  assert.ok(surface);
  assert.ok(surface.querySelector('.community-identity'));
  assert.equal(surface.querySelector('.community-identity__logo')?.getAttribute('src'), '/images/fourth-street-bar-logo.jpg');

  const layout = surface.querySelector('.community-layout');
  assert.ok(layout);
  assert.ok(layout.children[0]?.classList.contains('community-main'));
  assert.ok(layout.children[1]?.classList.contains('community-aside'));

  const postsTab = surface.querySelector('.social-tabs a[href="/community"]');
  const threadsTab = surface.querySelector('.social-tabs a[href="/community/threads"]');
  assert.ok(postsTab);
  assert.ok(threadsTab);
  assert.equal(postsTab.getAttribute('hx-target'), '#community-feed');
  assert.equal(threadsTab.getAttribute('hx-target'), '#community-feed');
  assert.match(postsTab.getAttribute('hx-get') || '', /\/community\/hive-108590\/community-posts\?sort=created/);
  assert.equal(threadsTab.getAttribute('hx-get'), '/community/threads');

  assert.ok(surface.querySelector('select[name="sort"]'));
  assert.equal(surface.querySelector('form[data-social-action="post"]'), null);
  assert.match(main?.textContent || '', /Welcome to the 4th Street Bar community/);
  assert.doesNotMatch(surface.textContent, /\bLive\b|\bEvents?\b|Suggested users|Nearby/);

  assert.match(COMMUNITY_POSTS_SOURCE, /canWriteAction\('post'\)/);
  assert.match(COMMUNITY_POSTS_SOURCE, /data-social-action="post"/);
  assert.match(COMMUNITY_POSTS_SOURCE, /data-signer-mode="<%= signerMode %>"/);
  assert.match(COMMUNITY_POSTS_SOURCE, /Review post/);
});

test('M15.3 Conversation is content-first while preserving comment and vote gates', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/post/etblink/welcome-fourth-street-bar').expect(200);
  const document = documentFor(response.text);

  const surface = document.querySelector('main[data-m15-surface="conversation"]');
  assert.ok(surface);
  assert.ok(surface.querySelector('.conversation-column'));
  assert.ok(surface.querySelector('.conversation-post'));
  assert.match(surface.querySelector('.conversation-post__title')?.textContent || '', /Welcome to the 4th Street Bar community/);
  assert.match(surface.textContent, /Pull up a stool/);
  assert.match(surface.textContent, /Glad to be here/);
  assert.match(surface.querySelector('#comments-heading')?.textContent || '', /Comments\s*\(1\)/);

  assert.ok(surface.querySelector('[data-comment-thread] .social-comment'));
  assert.equal(surface.querySelector('form[data-social-action="comment"]'), null);
  assert.equal(surface.querySelector('form[data-social-action="vote"]'), null);
  assert.doesNotMatch(response.text, /<svg\b/i);

  assert.match(FULL_POST_SOURCE, /canWriteAction\('comment'\)/);
  assert.match(FULL_POST_SOURCE, /data-social-action="comment"/);
  assert.match(FULL_POST_SOURCE, /name="parentAuthor" value="<%= post\.author %>"/);
  assert.match(FULL_POST_SOURCE, /name="parentPermlink" value="<%= post\.permlink %>"/);
  assert.match(FULL_POST_SOURCE, /include\('\.\.\/common\/vote-form', \{ item: post \}\)/);
});

test('M15.3 Profile becomes a modern identity header while retaining every current public tab', async () => {
  const { app } = createFixtureApp();
  const response = await request(app).get('/profile/barfriend').expect(200);
  const document = documentFor(response.text);

  const surface = document.querySelector('[data-m15-surface="profile"]');
  assert.ok(surface);
  assert.ok(surface.querySelector('.profile-hero'));
  assert.match(surface.querySelector('#profile-heading')?.textContent || '', /Bar Friend/);
  assert.match(surface.querySelector('.profile-hero__handle')?.textContent || '', /@barfriend/);
  assert.match(surface.textContent, /followers/i);
  assert.match(surface.textContent, /following/i);
  assert.match(surface.textContent, /posts/i);
  assert.match(surface.textContent, /Reputation/i);

  const hrefs = Array.from(surface.querySelectorAll('.profile-tabs a')).map((link) => link.getAttribute('href'));
  assert.deepEqual(hrefs, [
    '/profile/barfriend',
    '/profile/barfriend/wallet',
    '/profile/barfriend/wall-posts',
    '/profile/barfriend/followers',
    '/profile/barfriend/following',
  ]);

  assert.ok(surface.querySelector('.profile-content-panel .social-feed'));
  assert.equal(surface.querySelector('a[href="/profile/barfriend/inbox"]'), null);
  assert.equal(surface.querySelector('a[href="/profile/barfriend/settings"]'), null);
  assert.doesNotMatch(surface.textContent, /\bMedia\b|\bLikes\b|Suggested users/);

  assert.match(PROFILE_INFO_SOURCE, /canWriteAction\(followState \? 'unfollow' : 'follow'\)/);
  assert.match(PROFILE_INFO_SOURCE, /data-social-action="<%= followState \? 'unfollow' : 'follow' %>"/);
  assert.match(PROFILE_INFO_SOURCE, /Current on-chain state:/);
});

test('M15.3 social stylesheet is local, token-driven, and does not invent remote assets', () => {
  assert.match(SOCIAL_CSS, /var\(--hb-bg\)/);
  assert.match(SOCIAL_CSS, /var\(--hb-accent\)/);
  assert.match(SOCIAL_CSS, /\.social-feed-item\s*\{[^}]*border-bottom:/s);
  assert.match(SOCIAL_CSS, /\.social-tabs \.content-tab--active\s*\{[^}]*border-bottom-color:\s*var\(--hb-accent\)/s);
  assert.match(SOCIAL_CSS, /\.comment-card\.social-comment\s*\{[^}]*border-left:/s);
  assert.doesNotMatch(SOCIAL_CSS, /@import\s+url\(/i);
  assert.doesNotMatch(SOCIAL_CSS, /https?:\/\//i);
  assert.doesNotMatch(SOCIAL_CSS, /url\s*\(/i);
});
