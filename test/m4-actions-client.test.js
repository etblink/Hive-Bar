'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'm4-actions.js'),
  'utf8',
);

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function browser() {
  const dom = new JSDOM(
    `<!doctype html>
      <form data-m4-action="inbox">
        <input name="recipient" value="etblink">
        <input name="expectedFee" value="1.000 HBD">
        <input name="amount" value="1.000 HBD">
        <textarea name="message">secret plaintext</textarea>
        <button type="submit">Send</button>
        <p data-m4-status></p>
      </form>
      <article data-inbox-entry>
        <button type="button" data-inbox-ciphertext="#8ciphertext">Decrypt</button>
        <p data-inbox-plaintext hidden></p>
        <p data-m4-status></p>
      </article>`,
    { runScripts: 'outside-only', url: 'https://hive-bar.example/' },
  );
  dom.window.eval(source);
  return dom;
}

test('encrypts inbox plaintext before the server preflight and broadcasts only marked ciphertext', async () => {
  const dom = browser();
  const requests = [];
  const keychainCalls = [];
  let reloads = 0;
  let observations = 0;
  const preflight = {
    id: 'm4-preflight-1',
    account: 'barfriend',
    action: 'inbox',
    authority: 'Active',
    operations: [[
      'transfer',
      {
        from: 'barfriend',
        to: 'etblink',
        amount: '1.000 HBD',
        memo: 'hivebar-inbox:v1:#8ciphertext',
      },
    ]],
    fingerprint: 'f'.repeat(64),
    summary: { kind: 'Encrypted inbox message' },
  };
  const controller = new dom.window.HiveBarM4.M4ActionController({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url === '/auth/session') {
        return response({ authenticated: true, account: 'barfriend', csrfToken: 'csrf-1' });
      }
      if (url === '/api/m4/preflight/inbox') return response(preflight, 201);
      if (url.endsWith('/accepted')) {
        return response({ ...preflight, state: 'broadcast_accepted', message: 'Awaiting observation.' });
      }
      if (url.endsWith('/observe')) {
        observations += 1;
        return response({
          ...preflight,
          state: observations === 2 ? 'observed' : 'broadcast_accepted',
          message: observations === 2
            ? 'Exact operation observed.'
            : 'Broadcast accepted; transaction is not indexed yet.',
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    keychainFactory: () => ({
      async encodeMemo(value) {
        keychainCalls.push(['encode', value]);
        return { ciphertext: '#8ciphertext' };
      },
      async broadcast(value) {
        keychainCalls.push(['broadcast', value]);
        return { accepted: true, transactionId: 'a'.repeat(40) };
      },
    }),
    review: async () => true,
    waitImpl: async () => {},
    reload: () => {
      reloads += 1;
    },
  });

  try {
    const form = dom.window.document.querySelector('form');
    await controller.run(form);
    assert.equal(reloads, 1);
    assert.equal(observations, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(keychainCalls[0])), [
      'encode',
      {
        account: 'barfriend',
        receiver: 'etblink',
        message: 'hivebar-inbox:v1:secret plaintext',
      },
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(keychainCalls[1])), [
      'broadcast',
      { account: 'barfriend', operations: preflight.operations, authority: 'Active' },
    ]);
    const sent = requests.find((item) => item.url === '/api/m4/preflight/inbox');
    assert.deepEqual(JSON.parse(sent.options.body), {
      recipient: 'etblink',
      expectedFee: '1.000 HBD',
      amount: '1.000 HBD',
      ciphertext: '#8ciphertext',
    });
    assert.doesNotMatch(sent.options.body, /secret plaintext/);
    assert.equal(dom.window.localStorage.length, 0);
  } finally {
    dom.window.close();
  }
});

test('decrypts marked ciphertext locally and never posts plaintext back to the server', async () => {
  const dom = browser();
  const requests = [];
  const controller = new dom.window.HiveBarM4.M4ActionController({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url === '/auth/session') {
        return response({ authenticated: true, account: 'etblink', csrfToken: 'csrf-1' });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    keychainFactory: () => ({
      async decodeMemo(value) {
        assert.deepEqual(JSON.parse(JSON.stringify(value)), {
          account: 'etblink',
          ciphertext: '#8ciphertext',
        });
        return { plaintext: 'hivebar-inbox:v1:local secret' };
      },
    }),
  });

  try {
    const button = dom.window.document.querySelector('[data-inbox-ciphertext]');
    await controller.decrypt(button);
    const output = dom.window.document.querySelector('[data-inbox-plaintext]');
    assert.equal(output.textContent, 'local secret');
    assert.equal(output.hidden, false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options?.body, undefined);
    assert.equal(dom.window.localStorage.length, 0);
  } finally {
    dom.window.close();
  }
});
