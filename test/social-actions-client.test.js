'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { TextEncoder } = require('node:util');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'js', 'social-actions.js'),
  'utf8',
);

const operations = [
  ['vote', { voter: 'etblink', author: 'barfriend', permlink: 'hello-reno', weight: 3700 }],
];
const preflight = {
  id: 'preflight-1',
  account: 'etblink',
  action: 'vote',
  authority: 'Posting',
  operations,
  fingerprint: 'f'.repeat(64),
  summary: { kind: 'Vote', percent: 37 },
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function testBrowser() {
  const dom = new JSDOM(
    `<!doctype html><form data-social-action="vote">
      <input name="author" value="barfriend">
      <input name="permlink" value="hello-reno">
      <input name="percent" value="37">
      <button type="submit">Review vote</button>
      <p data-social-status></p>
    </form>
    <dialog data-social-confirm>
      <span data-social-account></span>
      <code data-social-fingerprint></code>
      <pre data-social-summary></pre>
      <pre data-social-operations></pre>
      <button type="button" data-social-confirm-button>Continue to Keychain</button>
      <button type="button" data-social-cancel-button>Cancel</button>
    </dialog>`,
    { runScripts: 'outside-only', url: 'https://hive-bar.example/' },
  );
  dom.window.TextEncoder = TextEncoder;
  dom.window.eval(source);
  return dom;
}

test('exact-operation review displays the operation fingerprint before Keychain', async () => {
  const dom = testBrowser();
  const dialog = dom.window.document.querySelector('[data-social-confirm]');
  dialog.showModal = () => {};
  dialog.close = () => {};
  const controller = new dom.window.HiveBarSocial.SocialActionController();

  try {
    const review = controller.reviewDialog(preflight);
    assert.equal(dialog.querySelector('[data-social-account]').textContent, '@etblink');
    assert.equal(dialog.querySelector('[data-social-fingerprint]').textContent, 'f'.repeat(64));
    assert.match(dialog.querySelector('[data-social-operations]').textContent, /\"weight\": 3700/);
    dialog.querySelector('[data-social-cancel-button]').click();
    assert.equal(await review, false);
  } finally {
    dom.window.close();
  }
});

test('mocked browser journey reviews, broadcasts, records acceptance, and waits for observation', async () => {
  const dom = testBrowser();
  const calls = [];
  let observationCount = 0;
  let reviewed;
  let broadcast;
  let reloads = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url === '/auth/session') {
      return response({ authenticated: true, account: 'etblink', csrfToken: 'csrf-1' });
    }
    if (url === '/api/social/preflight/vote') return response(preflight, 201);
    if (url.endsWith('/accepted')) {
      return response({ ...preflight, state: 'broadcast_accepted', message: 'Broadcast accepted; awaiting observation.' });
    }
    if (url.endsWith('/observe')) {
      observationCount += 1;
      return response({
        ...preflight,
        state: observationCount === 2 ? 'observed' : 'broadcast_accepted',
        message: observationCount === 2 ? 'Operation observed through Hive RPC.' : 'Broadcast accepted; not observed yet.',
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const controller = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl,
    review: async (value) => {
      reviewed = value;
      return true;
    },
    keychainFactory: () => ({
      async broadcast(value) {
        broadcast = value;
        return { accepted: true, transactionId: 'a'.repeat(40) };
      },
    }),
    waitImpl: async () => {},
    reload: () => {
      reloads += 1;
    },
  });

  try {
    const form = dom.window.document.querySelector('form');
    await controller.run(form);
    assert.equal(reviewed.account, 'etblink');
    assert.deepEqual(JSON.parse(JSON.stringify(broadcast)), {
      account: 'etblink',
      operations,
      authority: 'Posting',
    });
    assert.equal(reloads, 1);
    assert.equal(observationCount, 2);
    assert.match(form.querySelector('[data-social-status]').textContent, /observed through Hive RPC/);
    assert.equal(form.querySelector('button').disabled, false);

    const preflightRequest = calls.find((call) => call.url.endsWith('/preflight/vote'));
    assert.deepEqual(JSON.parse(preflightRequest.options.body), {
      author: 'barfriend',
      permlink: 'hello-reno',
      percent: 37,
    });
    assert.equal(preflightRequest.options.headers['x-csrf-token'], 'csrf-1');
    const acceptedRequest = calls.find((call) => call.url.endsWith('/accepted'));
    assert.deepEqual(JSON.parse(acceptedRequest.options.body), { transactionId: 'a'.repeat(40) });
  } finally {
    dom.window.close();
  }
});

test('review cancellation releases the preflight without invoking Keychain', async () => {
  const dom = testBrowser();
  const urls = [];
  let broadcasts = 0;
  const controller = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl: async (url) => {
      urls.push(url);
      if (url === '/auth/session') return response({ authenticated: true, csrfToken: 'csrf-1' });
      if (url === '/api/social/preflight/vote') return response(preflight, 201);
      if (url.endsWith('/cancel')) return response(null, 204);
      throw new Error(`Unexpected URL ${url}`);
    },
    review: async () => false,
    keychainFactory: () => ({
      async broadcast() {
        broadcasts += 1;
      },
    }),
  });

  try {
    const form = dom.window.document.querySelector('form');
    await controller.run(form);
    assert.equal(broadcasts, 0);
    assert.deepEqual(urls, [
      '/auth/session',
      '/api/social/preflight/vote',
      '/api/social/preflight/preflight-1/cancel',
    ]);
    assert.match(form.querySelector('[data-social-status]').textContent, /Nothing was broadcast/);
  } finally {
    dom.window.close();
  }
});

test('Keychain cancellation clears prepared state and never leaves optimistic success', async () => {
  const dom = testBrowser();
  const urls = [];
  let reloads = 0;
  const controller = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl: async (url) => {
      urls.push(url);
      if (url === '/auth/session') return response({ authenticated: true, csrfToken: 'csrf-1' });
      if (url === '/api/social/preflight/vote') return response(preflight, 201);
      if (url.endsWith('/cancel')) return response(null, 204);
      throw new Error(`Unexpected URL ${url}`);
    },
    review: async () => true,
    keychainFactory: () => ({
      async broadcast() {
        const error = new Error('The Keychain request was cancelled. Nothing was broadcast.');
        error.code = 'KEYCHAIN_CANCELLED';
        throw error;
      },
    }),
    reload: () => {
      reloads += 1;
    },
  });

  try {
    const form = dom.window.document.querySelector('form');
    await controller.run(form);
    assert.equal(reloads, 0);
    assert.equal(urls.at(-1), '/api/social/preflight/preflight-1/cancel');
    assert.match(form.querySelector('[data-social-status]').textContent, /cancelled/);
    assert.doesNotMatch(form.querySelector('[data-social-status]').textContent, /accepted/i);
  } finally {
    dom.window.close();
  }
});

test('broadcast acceptance remains pending when the chain has not observed the operation', async () => {
  const dom = testBrowser();
  let observations = 0;
  let reloads = 0;
  const controller = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl: async (url) => {
      if (url === '/auth/session') return response({ authenticated: true, csrfToken: 'csrf-1' });
      if (url === '/api/social/preflight/vote') return response(preflight, 201);
      if (url.endsWith('/accepted')) {
        return response({ ...preflight, state: 'broadcast_accepted', message: 'Broadcast accepted.' });
      }
      if (url.endsWith('/observe')) {
        observations += 1;
        return response({ ...preflight, state: 'broadcast_accepted', message: 'Broadcast accepted; not observed yet.' });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    review: async () => true,
    keychainFactory: () => ({
      async broadcast() {
        return { accepted: true, transactionId: 'b'.repeat(40) };
      },
    }),
    waitImpl: async () => {},
    reload: () => {
      reloads += 1;
    },
  });

  try {
    const form = dom.window.document.querySelector('form');
    await controller.run(form);
    assert.equal(observations, 5);
    assert.equal(reloads, 0);
    assert.match(form.querySelector('[data-social-status]').textContent, /not observed yet/);
  } finally {
    dom.window.close();
  }
});
