'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const adapterSource = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'keychain-adapter.js'),
  'utf8',
);

function browserWith(keychain) {
  const dom = new JSDOM('<!doctype html><p>Keychain adapter test</p>', {
    runScripts: 'outside-only',
    url: 'https://hive-bar.example/',
  });
  if (keychain) dom.window.hive_keychain = keychain;
  dom.window.eval(adapterSource);
  return dom;
}

test('uses separate connection and human-interaction timeout defaults', () => {
  const dom = browserWith({});
  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter();
    assert.equal(adapter.connectionTimeoutMs, 15_000);
    assert.equal(adapter.interactiveTimeoutMs, 120_000);
  } finally {
    dom.window.close();
  }
});

test('normalizes a successful Posting challenge signature without storing identity', async () => {
  const calls = [];
  const keychain = {
    requestHandshake(callback) {
      calls.push(['handshake']);
      callback({ success: true });
    },
    requestSignBuffer(...args) {
      calls.push(['sign', ...args.slice(0, 3), args[4], args[5]]);
      args[3]({
        success: true,
        result: '1f'.padEnd(130, '0'),
        publicKey: 'STM8CC2FP7LT99hUSANGNY1RH1PgDvEdPJLBYEfugmrAqyyA26tfm',
        data: { username: 'etblink', message: 'exact server challenge' },
      });
    },
  };
  const dom = browserWith(keychain);
  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({ timeoutMs: 100 });
    const signed = await adapter.signBuffer({
      account: 'etblink',
      message: 'exact server challenge',
      title: 'Hive-Bar sign-in as @etblink',
    });
    assert.deepEqual({ ...signed }, {
      signature: '1f'.padEnd(130, '0'),
      publicKey: 'STM8CC2FP7LT99hUSANGNY1RH1PgDvEdPJLBYEfugmrAqyyA26tfm',
    });
    assert.deepEqual(calls[0], ['handshake']);
    assert.deepEqual(calls[1], [
      'sign',
      'etblink',
      'exact server challenge',
      'Posting',
      undefined,
      'Hive-Bar sign-in as @etblink',
    ]);
    assert.equal(dom.window.localStorage.length, 0);
  } finally {
    dom.window.close();
  }
});

test('calls Keychain broadcast with exact operations and Posting authority', async () => {
  const operation = ['vote', { voter: 'etblink', author: 'barfriend', permlink: 'hello', weight: 4200 }];
  let observedArgs;
  const dom = browserWith({
    requestHandshake(callback) {
      callback();
    },
    requestBroadcast(...args) {
      observedArgs = args;
      args[3]({ success: true, result: { id: 'abc123' } });
    },
  });
  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({ timeoutMs: 100 });
    const result = await adapter.broadcast({ account: 'etblink', operations: [operation] });
    assert.deepEqual({ ...result }, { accepted: true, transactionId: 'abc123' });
    assert.equal(observedArgs.length, 5);
    assert.equal(observedArgs[0], 'etblink');
    assert.deepEqual(observedArgs[1], [operation]);
    assert.equal(observedArgs[2], 'Posting');
    assert.equal(observedArgs[4], undefined);
  } finally {
    dom.window.close();
  }
});

test('uses explicit Active authority and keeps Memo encryption and decryption inside Keychain', async () => {
  const calls = [];
  const dom = browserWith({
    requestHandshake(callback) {
      callback();
    },
    requestBroadcast(...args) {
      calls.push(['broadcast', ...args.slice(0, 3)]);
      args[3]({ success: true, result: { id: 'active-tx' } });
    },
    requestEncodeMessage(...args) {
      calls.push(['encode', ...args.slice(0, 4)]);
      args[4]({ success: true, result: '#8ciphertext' });
    },
    requestVerifyKey(...args) {
      calls.push(['decode', ...args.slice(0, 3)]);
      args[3]({ success: true, result: '#hivebar-inbox:v1:secret' });
    },
  });
  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({ timeoutMs: 100 });
    const operation = ['transfer', {
      from: 'barfriend',
      to: 'etblink',
      amount: '1.000 HBD',
      memo: 'hivebar-inbox:v1:#8ciphertext',
    }];
    await adapter.broadcast({ account: 'barfriend', operations: [operation], authority: 'Active' });
    const encoded = await adapter.encodeMemo({
      account: 'barfriend',
      receiver: 'etblink',
      message: '#hivebar-inbox:v1:secret',
    });
    const decoded = await adapter.decodeMemo({ account: 'etblink', ciphertext: encoded.ciphertext });
    assert.deepEqual(calls, [
      ['broadcast', 'barfriend', [operation], 'Active'],
      ['encode', 'barfriend', 'etblink', '#hivebar-inbox:v1:secret', 'Memo'],
      ['decode', 'etblink', '#8ciphertext', 'Memo'],
    ]);
    assert.deepEqual({ ...encoded }, { ciphertext: '#8ciphertext' });
    assert.deepEqual({ ...decoded }, { plaintext: '#hivebar-inbox:v1:secret' });
    assert.equal(dom.window.localStorage.length, 0);
  } finally {
    dom.window.close();
  }
});

test('allows a reviewed Memo response after the shorter connection timeout', async () => {
  let dom;
  dom = browserWith({
    requestHandshake(callback) {
      callback();
    },
    requestEncodeMessage(_account, _receiver, _message, _authority, callback) {
      dom.window.setTimeout(() => callback({ success: true, result: '#8delayedciphertext' }), 30);
    },
  });
  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({
      connectionTimeoutMs: 10,
      interactiveTimeoutMs: 100,
    });
    const encoded = await adapter.encodeMemo({
      account: 'barfriend',
      receiver: 'etblink',
      message: '#hivebar-inbox:v1:reviewed secret',
    });
    assert.deepEqual({ ...encoded }, { ciphertext: '#8delayedciphertext' });
  } finally {
    dom.window.close();
  }
});

test('keeps a timed-out Memo request rejected when Keychain responds late', async () => {
  let respond;
  const dom = browserWith({
    requestHandshake(callback) {
      callback();
    },
    requestEncodeMessage(_account, _receiver, _message, _authority, callback) {
      respond = callback;
    },
  });
  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({
      connectionTimeoutMs: 100,
      interactiveTimeoutMs: 10,
    });
    const pending = adapter.encodeMemo({
      account: 'barfriend',
      receiver: 'etblink',
      message: '#hivebar-inbox:v1:reviewed secret',
    });
    await assert.rejects(
      pending,
      (error) => error.code === 'KEYCHAIN_TIMEOUT' && /did not respond in time/.test(error.message),
    );
    respond({ success: true, result: '#8lateciphertext' });
    await assert.rejects(pending, (error) => error.code === 'KEYCHAIN_TIMEOUT');
  } finally {
    dom.window.close();
  }
});

test('rejects memo plaintext without the Hive encryption marker before contacting Keychain', async () => {
  let handshakes = 0;
  const dom = browserWith({
    requestHandshake(callback) {
      handshakes += 1;
      callback();
    },
  });
  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({ timeoutMs: 100 });
    await assert.rejects(
      adapter.encodeMemo({
        account: 'barfriend',
        receiver: 'etblink',
        message: 'hivebar-inbox:v1:secret',
      }),
      (error) => error.code === 'KEYCHAIN_MEMO_PLAINTEXT_INVALID' && /begin with #/.test(error.message),
    );
    assert.equal(handshakes, 0);
  } finally {
    dom.window.close();
  }
});

test('distinguishes cancellation, locked Keychain, account mismatch, and absence', async () => {
  async function rejectedCode(keychain, method = 'signBuffer') {
    const dom = browserWith(keychain);
    try {
      const adapter = new dom.window.HiveBarKeychain.KeychainAdapter({ timeoutMs: 10 });
      await adapter[method]({
        account: 'etblink',
        message: 'challenge',
        operations: [],
      });
      assert.fail('Expected Keychain request to reject');
    } catch (error) {
      return error.code;
    } finally {
      dom.window.close();
    }
  }

  assert.equal(
    await rejectedCode({
      requestSignBuffer(_account, _message, _authority, callback) {
        callback({ success: false, error: 'user_cancel' });
      },
    }),
    'KEYCHAIN_CANCELLED',
  );
  assert.equal(
    await rejectedCode({
      requestSignBuffer(_account, _message, _authority, callback) {
        callback({ success: false, error: 'Keychain is locked; unlock required' });
      },
    }),
    'KEYCHAIN_LOCKED',
  );
  assert.equal(
    await rejectedCode({
      requestSignBuffer(_account, message, _authority, callback) {
        callback({
          success: true,
          result: '1f'.padEnd(130, '0'),
          publicKey: 'STM8CC2FP7LT99hUSANGNY1RH1PgDvEdPJLBYEfugmrAqyyA26tfm',
          data: { username: 'someone-else', message },
        });
      },
    }),
    'KEYCHAIN_ACCOUNT_MISMATCH',
  );
  assert.equal(await rejectedCode(null), 'KEYCHAIN_UNAVAILABLE');
});
