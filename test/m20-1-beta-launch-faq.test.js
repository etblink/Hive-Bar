'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const request = require('supertest');
const { createFixtureApp } = require('./support/test-app');

test('M20.1 serves a read-only plain-English FAQ without touching Hive', async () => {
  const { app, rpcPool } = createFixtureApp();
  const response = await request(app).get('/faq').expect(200).expect('content-type', /html/);

  assert.match(response.text, /Frequently asked questions/);
  assert.match(response.text, /You do not need to understand blockchain to use 4th Street Bar/);
  assert.match(response.text, /What is HIVE\?/);
  assert.match(response.text, /What is HBD\?/);
  assert.match(response.text, /What is Hive Power \(HP\)\?/);
  assert.match(response.text, /What are Resource Credits\?/);
  assert.match(response.text, /not a bank deposit or a guaranteed dollar peg/);
  assert.match(response.text, /paid Wall message or encrypted private message/);
  assert.match(response.text, /The message text is encrypted by Keychain in your browser/);
  assert.match(response.text, /The creating account becomes the initial Hive recovery account/);
  assert.doesNotMatch(response.text, /data-m4-action|data-social-action/);
  assert.equal(rpcPool.calls.length, 0);
});

test('M20.1 links FAQ help from the global footer without changing its shell contract', async () => {
  const { app } = createFixtureApp();
  const home = await request(app).get('/').expect(200);

  assert.match(home.text, /href="\/faq">FAQ &amp; Hive basics<\/a>/);
  assert.match(home.text, /<footer class="app-footer">[\s\S]*<p class="mt-2">[\s\S]*FAQ &amp; Hive basics[\s\S]*<\/p>[\s\S]*<\/div>[\s\S]*<\/footer>/);
});
