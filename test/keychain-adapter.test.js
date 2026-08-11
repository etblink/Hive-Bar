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
