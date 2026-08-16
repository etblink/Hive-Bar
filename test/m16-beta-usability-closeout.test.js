'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function socialBrowser() {
  const dom = new JSDOM(
    `<!doctype html>
    <form data-social-action="vote" data-signer-mode="keychain">
      <input name="author" value="fartman69">
      <input name="permlink" value="beta-post">
      <input name="percent" value="1">
      <button type="submit">Review vote</button>
      <p data-social-status></p>
    </form>`,
    { runScripts: 'outside-only', url: 'https://fourthstreetbar.com/post/fartman69/beta-post' },
  );
  dom.window.eval(source('public/js/social-actions.js'));
  dom.window.eval(source('public/js/m16-beta-usability.js'));
  return dom;
}

function m4WallBrowser() {
  const dom = new JSDOM(
    `<!doctype html>
    <form data-m4-action="wall">
      <input name="recipient" value="fourthstreetbar">
      <input name="expectedFee" value="1.000 HBD">
      <input name="amount" value="1.000 HBD">
      <textarea name="message">hello wall</textarea>
      <button type="submit">Send public message</button>
      <p data-m4-status></p>
    </form>`,
    { runScripts: 'outside-only', url: 'https://fourthstreetbar.com/profile/fourthstreetbar' },
  );
  dom.window.eval(source('public/js/m4-actions.js'));
  dom.window.eval(source('public/js/m16-beta-usability.js'));
  return dom;
}

test('M16.8 pending social confirmation rechecks the same preflight without another Keychain broadcast', async () => {
  const dom = socialBrowser();
  const preflight = {
    id: 'preflight-1',
    account: 'etblink',
    action: 'vote',
    authority: 'Posting',
    operations: [['vote', { voter: 'etblink', author: 'fartman69', permlink: 'beta-post', weight: 100 }]],
    fingerprint: 'f'.repeat(64),
    summary: { kind: 'Upvote', percent: 1 },
  };
  let authCalls = 0;
  let preflightCalls = 0;
  let acceptedCalls = 0;
  let observeCalls = 0;
  let broadcasts = 0;
  let reloads = 0;
  let allowObservation = false;

  const controller = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl: async (url) => {
      if (url === '/auth/session') {
        authCalls += 1;
        return response({ authenticated: true, account: 'etblink', csrfToken: 'csrf-1' });
      }
      if (url === '/api/social/preflight/vote') {
        preflightCalls += 1;
        return response(preflight, 201);
      }
      if (url.endsWith('/accepted')) {
        acceptedCalls += 1;
        return response({ ...preflight, state: 'broadcast_accepted', message: 'Waiting for Hive.' });
      }
      if (url.endsWith('/observe')) {
        observeCalls += 1;
        return response({
          ...preflight,
          state: allowObservation ? 'observed' : 'broadcast_accepted',
          message: allowObservation ? 'Confirmed on Hive.' : 'Confirmation is still pending.',
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    review: async () => true,
    keychainFactory: () => ({
      async broadcast() {
        broadcasts += 1;
        return { accepted: true, transactionId: 'a'.repeat(40) };
      },
    }),
    waitImpl: async () => {},
    reload: () => { reloads += 1; },
  });

  try {
    const form = dom.window.document.querySelector('form');
    const button = form.querySelector('button[type="submit"]');
    await controller.run(form);

    assert.equal(authCalls, 1);
    assert.equal(preflightCalls, 1);
    assert.equal(acceptedCalls, 1);
    assert.equal(observeCalls, 5);
    assert.equal(broadcasts, 1);
    assert.equal(reloads, 0);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Recheck Hive confirmation');
    assert.match(form.querySelector('[data-social-status]').textContent, /Do not submit it again/);
    assert.match(form.querySelector('[data-social-status]').textContent, /without signing or broadcasting again/);

    allowObservation = true;
    await controller.run(form);

    assert.equal(authCalls, 1);
    assert.equal(preflightCalls, 1);
    assert.equal(acceptedCalls, 1);
    assert.equal(observeCalls, 6);
    assert.equal(broadcasts, 1);
    assert.equal(reloads, 1);
    assert.equal(button.textContent, 'Review vote');
  } finally {
    dom.window.close();
  }
});

test('M16.8 ambiguous post-Keychain acceptance locks the submit path instead of permitting a duplicate', async () => {
  const dom = socialBrowser();
  const preflight = {
    id: 'preflight-2',
    account: 'etblink',
    action: 'vote',
    authority: 'Posting',
    operations: [['vote', { voter: 'etblink', author: 'fartman69', permlink: 'beta-post', weight: -100 }]],
    fingerprint: 'e'.repeat(64),
    summary: { kind: 'Downvote', percent: 1 },
  };
  let preflightCalls = 0;
  let broadcasts = 0;

  const controller = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl: async (url) => {
      if (url === '/auth/session') return response({ authenticated: true, account: 'etblink', csrfToken: 'csrf-2' });
      if (url === '/api/social/preflight/vote') {
        preflightCalls += 1;
        return response(preflight, 201);
      }
      if (url.endsWith('/accepted')) return response({ error: { message: 'Temporary server error' } }, 503);
      throw new Error(`Unexpected URL ${url}`);
    },
    review: async () => true,
    keychainFactory: () => ({
      async broadcast() {
        broadcasts += 1;
        return { accepted: true, transactionId: 'b'.repeat(40) };
      },
    }),
  });

  try {
    const form = dom.window.document.querySelector('form');
    const button = form.querySelector('button[type="submit"]');
    await controller.run(form);

    assert.equal(preflightCalls, 1);
    assert.equal(broadcasts, 1);
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, 'Confirmation pending');
    assert.match(form.querySelector('[data-social-status]').textContent, /Do not submit it again/);

    await controller.run(form);
    assert.equal(preflightCalls, 1);
    assert.equal(broadcasts, 1);
  } finally {
    dom.window.close();
  }
});

test('M16.8 confirmed public wall message lands on the exact recipient Wall tab', async () => {
  const dom = m4WallBrowser();
  const preflight = {
    id: 'm4-preflight-1',
    account: 'fartman69',
    action: 'wall',
    authority: 'Active',
    operations: [[
      'transfer',
      {
        from: 'fartman69',
        to: 'fourthstreetbar',
        amount: '1.000 HBD',
        memo: 'hivebar-wall:v1:hello wall',
      },
    ]],
    fingerprint: 'c'.repeat(64),
    summary: { kind: 'Permanent public wall message' },
  };
  let broadcasts = 0;
  let reloads = 0;
  const navigations = [];

  const controller = new dom.window.HiveBarM4.M4ActionController({
    fetchImpl: async (url) => {
      if (url === '/auth/session') return response({ authenticated: true, account: 'fartman69', csrfToken: 'csrf-3' });
      if (url === '/api/m4/preflight/wall') return response(preflight, 201);
      if (url.endsWith('/accepted')) return response({ ...preflight, state: 'broadcast_accepted', message: 'Waiting for Hive.' });
      if (url.endsWith('/observe')) return response({ ...preflight, state: 'observed', message: 'Confirmed on Hive.' });
      throw new Error(`Unexpected URL ${url}`);
    },
    keychainFactory: () => ({
      async broadcast() {
        broadcasts += 1;
        return { accepted: true, transactionId: 'c'.repeat(40) };
      },
    }),
    review: async () => true,
    waitImpl: async () => {},
    reload: () => { reloads += 1; },
  });
  controller.m16Navigate = (url) => navigations.push(url);

  try {
    await controller.run(dom.window.document.querySelector('form'));
    assert.equal(broadcasts, 1);
    assert.equal(reloads, 0);
    assert.deepEqual(navigations, ['/profile/fourthstreetbar/wall-posts']);
  } finally {
    dom.window.close();
  }
});

test('M16.8 keeps raw Keychain placeholder diagnostics outside Hive-Bar UI', async () => {
  const dom = new JSDOM('<!doctype html>', { runScripts: 'outside-only', url: 'https://fourthstreetbar.com/' });
  dom.window.hive_keychain = {
    requestHandshake(callback) { callback({ success: true }); },
    requestBroadcast(_account, _operations, _authority, callback) {
      callback({
        success: false,
        error: 'Insufficient downvote mana: ${v} ${d} ${r}',
      });
    },
  };
  dom.window.eval(source('public/js/keychain-adapter.js'));

  try {
    const adapter = new dom.window.HiveBarKeychain.KeychainAdapter();
    await assert.rejects(
      () => adapter.broadcast({
        account: 'etblink',
        operations: [['vote', { voter: 'etblink', author: 'fartman69', permlink: 'beta-post', weight: -100 }]],
        authority: 'Posting',
      }),
      (error) => {
        assert.equal(error.code, 'KEYCHAIN_REQUEST_FAILED');
        assert.equal(error.message, 'Hive Keychain could not complete the request.');
        assert.doesNotMatch(error.message, /\$\{/);
        return true;
      },
    );
  } finally {
    dom.window.close();
  }
});
