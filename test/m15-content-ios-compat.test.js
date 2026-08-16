'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { ChallengeStore } = require('../src/auth/session-store');
const { renderMarkdown } = require('../src/content/markdown');

const adapterSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'keychain-adapter.js'),
  'utf8',
);

function browserWith(keychain) {
  const dom = new JSDOM('<!doctype html><p>M15.5.3 Keychain test</p>', {
    runScripts: 'outside-only',
    url: 'https://fourthstreetbar.com/',
  });
  dom.window.hive_keychain = keychain;
  dom.window.eval(adapterSource);
  return dom;
}

test('M15.5.3 normalizes external post images through the existing Hive image origin', () => {
  const rendered = renderMarkdown([
    '![PeakD image](https://files.peakd.com/file/peakd-hive/etblink/example.png)',
    '',
    '![Already proxied](https://images.hive.blog/DQmExample/image.jpg)',
  ].join('\n'));

  assert.match(
    rendered,
    /src="https:\/\/images\.hive\.blog\/0x0\/https:\/\/files\.peakd\.com\/file\/peakd-hive\/etblink\/example\.png"/,
  );
  assert.match(rendered, /src="https:\/\/images\.hive\.blog\/DQmExample\/image\.jpg"/);
  assert.equal((rendered.match(/\/0x0\/https:\/\/images\.hive\.blog/g) || []).length, 0);
  assert.equal((rendered.match(/loading="lazy"/g) || []).length, 2);
  assert.equal((rendered.match(/decoding="async"/g) || []).length, 2);
});

test('M15.5.3 renders common inline and display TeX as local safe MathML', () => {
  const rendered = renderMarkdown([
    'Inline $p_i = \\frac{n_i}{N}$ remains in the sentence.',
    '',
    '$$\\sum_{i=1}^{k} p_i = 1$$',
    '',
    '\\[\\sqrt{x^2+y^2} \\leq z\\]',
  ].join('\n'));

  assert.match(rendered, /class="hb-math hb-math--inline"/);
  assert.match(rendered, /<math[^>]+display="inline"/);
  assert.match(rendered, /<mfrac>/);
  assert.match(rendered, /<msubsup><mo[^>]*>∑<\/mo>/);
  assert.match(rendered, /<msqrt>/);
  assert.match(rendered, /≤/);
  assert.match(rendered, /annotation encoding="application\/x-tex"/);
  assert.doesNotMatch(rendered, /<script|javascript:/i);
});

test('M15.5.3 leaves code and ordinary currency alone while containing hostile TeX commands', () => {
  const rendered = renderMarkdown([
    '`$x^2$` is code.',
    '',
    'The tab costs $5.',
    '',
    '$\\href{javascript:alert(1)}{click}$',
  ].join('\n'));

  assert.match(rendered, /<code>\$x\^2\$<\/code>/);
  assert.match(rendered, /The tab costs \$5\./);
  assert.doesNotMatch(rendered, /href="javascript:|<script/i);
  assert.match(rendered, /\\href/);
});

test('M15.5.3 emits a single-line sign-in challenge compatible with Keychain mobile injection', () => {
  const now = Date.parse('2026-08-16T02:00:00Z');
  let token = 0;
  const store = new ChallengeStore({
    ttlMs: 300_000,
    origin: 'https://fourthstreetbar.com',
    now: () => now,
    random: () => `token-${++token}`,
  });

  const challenge = store.issue('etblink');
  assert.doesNotMatch(challenge.message, /[\r\n\u2028\u2029]/);
  assert.match(
    challenge.message,
    /^Hive-Bar verified sign-in \| Account: @etblink \| Origin: https:\/\/fourthstreetbar\.com \|/,
  );
  assert.match(
    challenge.message,
    /\| Nonce: token-2 \| Issued: 2026-08-16T02:00:00\.000Z \|/,
  );
  assert.match(
    challenge.message,
    /Purpose: Create a server-verified session only; no Hive transaction is authorized\.$/,
  );
});

test('M15.5.3 keeps a timed-out signBuffer request failed when Keychain answers late', async () => {
  let respond;
  const dom = browserWith({
    requestHandshake(callback) {
      callback({ success: true });
    },
    requestSignBuffer(_account, _message, _authority, callback) {
      respond = callback;
    },
  });

  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({
      connectionTimeoutMs: 100,
      interactiveTimeoutMs: 10,
    });
    const pending = adapter.signBuffer({
      account: 'etblink',
      message: 'single-line challenge',
      title: 'Hive-Bar sign-in as @etblink',
    });

    await assert.rejects(
      pending,
      (error) => error.code === 'KEYCHAIN_TIMEOUT' && /did not respond in time/.test(error.message),
    );

    respond({
      success: true,
      result: '1f'.padEnd(130, '0'),
      publicKey: 'STM8CC2FP7LT99hUSANGNY1RH1PgDvEdPJLBYEfugmrAqyyA26tfm',
      data: { username: 'etblink', message: 'single-line challenge' },
    });

    await assert.rejects(pending, (error) => error.code === 'KEYCHAIN_TIMEOUT');
  } finally {
    dom.window.close();
  }
});