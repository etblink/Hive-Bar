'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const storedXssCorpus = require('./fixtures/stored-xss.json');
const { plainTextExcerpt, renderMarkdown } = require('../src/content/markdown');

test('renders useful Markdown while stripping active content and unsafe schemes', () => {
  const html = renderMarkdown(
    '# Hello\n\n<script>alert(1)</script>\n\n[secure](https://example.com) [plain](http://example.com) [bad](javascript:alert(1))',
  );

  assert.match(html, /<h1>Hello<\/h1>/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /rel="nofollow noopener noreferrer"/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /href="http:\/\//i);
});

test('allows only HTTPS image sources and applies lazy loading', () => {
  const html = renderMarkdown('![safe](https://images.hive.blog/example.png) ![unsafe](http://example.com/a.png)');

  assert.match(html, /src="https:\/\/images\.hive\.blog\/example\.png"/);
  assert.match(html, /loading="lazy"/);
  assert.doesNotMatch(html, /src="http:\/\//i);
});

test('creates bounded plain-text excerpts', () => {
  assert.equal(plainTextExcerpt('**Hello** [world](https://example.com)', 20), 'Hello world');
  assert.equal(plainTextExcerpt('abcdefghijklmnopqrstuvwxyz', 10), 'abcdefghi…');
  assert.equal(plainTextExcerpt(null), '');
});

test('blocks the stored-XSS regression corpus in executable contexts', () => {
  for (const payload of storedXssCorpus) {
    const html = renderMarkdown(payload);
    const renderedTags = (html.match(/<[^>]+>/g) || []).join(' ');
    assert.doesNotMatch(
      html,
      /<(?:script|svg|math|iframe|object|embed|form|input|button|style|link|meta|video|audio|source)\b/i,
      payload,
    );
    assert.doesNotMatch(renderedTags, /\son[a-z]+\s*=/i, payload);
    assert.doesNotMatch(
      renderedTags,
      /(?:href|src)\s*=\s*["'](?:javascript|vbscript|data|file|http):/i,
      payload,
    );
    assert.doesNotMatch(renderedTags, /(?:href|src)\s*=\s*["']\/\//i, payload);
  }
});
