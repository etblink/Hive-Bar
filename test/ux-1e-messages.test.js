'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ejs = require('ejs');
const { messageProfilesForPage } = require('../routes/profile');

const ROOT = path.resolve(__dirname, '..');

function messagePage(kind) {
  if (kind === 'wall') {
    return {
      items: [
        {
          sender: 'alice',
          amount: '1.000 HBD',
          message: 'Meet us by the pool table after work.',
          timestamp: '2026-08-20T19:00:00',
          transactionId: 'a'.repeat(40),
          blockNumber: 101,
        },
      ],
      nextCursor: null,
    };
  }
  return {
    items: [
      {
        sender: 'alice',
        amount: '1.000 HBD',
        ciphertext: '#memo-ciphertext-for-ux-1e',
        timestamp: '2026-08-20T19:05:00',
        transactionId: 'b'.repeat(40),
        blockNumber: 102,
      },
    ],
    nextCursor: null,
  };
}

const profileMap = {
  alice: {
    name: 'alice',
    displayName: 'Alice Example',
    profileImage: 'https://images.hive.blog/u/alice/avatar/small',
  },
};

function locals(values = {}) {
  return {
    userProfile: { name: 'fartman69' },
    profileSettings: { wallFee: '1.000 HBD' },
    wallPage: messagePage('wall'),
    inboxPage: messagePage('inbox'),
    messageProfiles: profileMap,
    hiveSession: null,
    canWriteAction: () => false,
    formatHiveDate: (value) => value,
    ...values,
  };
}

test('UX-1E hydrates distinct message senders in one best-effort profile lookup', async () => {
  const calls = [];
  const req = {
    app: {
      locals: {
        services: {
          hiveReads: {
            getProfiles: async (names) => {
              calls.push(names);
              return profileMap;
            },
          },
        },
      },
    },
    log: { warn() {} },
  };

  const result = await messageProfilesForPage(req, {
    items: [{ sender: 'alice' }, { sender: 'bob' }, { sender: 'alice' }],
  });

  assert.deepEqual(calls, [['alice', 'bob']]);
  assert.deepEqual(result, profileMap);
});

test('UX-1E profile hydration fails open to account fallback without hiding messages', async () => {
  const warnings = [];
  const req = {
    app: {
      locals: {
        services: {
          hiveReads: {
            getProfiles: async () => {
              throw new Error('fixture profile RPC unavailable');
            },
          },
        },
      },
    },
    log: {
      warn(payload, message) {
        warnings.push({ payload, message });
      },
    },
  };

  const result = await messageProfilesForPage(req, { items: [{ sender: 'alice' }] });
  assert.deepEqual(result, {});
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].message, 'message sender profile hydration failed');
  assert.deepEqual(warnings[0].payload.senders, ['alice']);
});

test('UX-1E public Wall presents human message before payment and transaction provenance', async () => {
  const html = await ejs.renderFile(
    path.join(ROOT, 'views/pages/profile/partials/wall-posts.ejs'),
    locals(),
  );

  assert.match(html, /data-message-kind="wall"/);
  assert.match(html, /Alice Example/);
  assert.match(html, /@alice/);
  assert.match(html, /message-entry__avatar/);
  assert.match(html, /Meet us by the pool table after work\./);
  assert.match(html, /Transaction details/);

  const entryStart = html.indexOf('data-message-kind="wall"');
  const entryEnd = html.indexOf('</article>', entryStart);
  const entryHtml = html.slice(entryStart, entryEnd);
  assert.ok(
    entryHtml.indexOf('Meet us by the pool table after work.') < entryHtml.indexOf('1.000 HBD'),
    'wall message body should precede its per-message payment metadata',
  );
  assert.ok(
    entryHtml.indexOf('1.000 HBD') < entryHtml.indexOf('Transaction details'),
    'payment remains visible before progressively disclosed transaction provenance',
  );
});

test('UX-1E Wall sender identity has a local account-initial fallback when profile hydration is absent', async () => {
  const html = await ejs.renderFile(
    path.join(ROOT, 'views/pages/profile/partials/wall-posts.ejs'),
    locals({ messageProfiles: {} }),
  );

  assert.match(html, />alice<\/a>/);
  assert.match(html, /message-entry__avatar--fallback/);
  assert.match(html, />A<\/span>/);
  assert.doesNotMatch(html, /images\.hive\.blog\/u\/alice\/avatar\/small/);
  assert.match(html, /Meet us by the pool table after work\./);
});

test('UX-1E Inbox is a private-message surface, not a wallet panel', async () => {
  const html = await ejs.renderFile(
    path.join(ROOT, 'views/pages/profile/partials/inbox.ejs'),
    locals(),
  );

  assert.match(html, /data-message-kind="inbox"/);
  assert.match(html, /Alice Example/);
  assert.match(html, /Messages are stored on Hive as encrypted text/);
  assert.match(html, /Hive Keychain uses your Memo key in this browser to decrypt the message locally/);
  assert.match(html, /decrypted message is not sent back to Hive-Bar/);
  assert.match(html, /Decrypt with Keychain/);
  assert.match(html, /data-inbox-ciphertext="#memo-ciphertext-for-ux-1e"/);
  assert.match(html, /data-inbox-plaintext hidden/);
  assert.match(html, /aria-live="polite" data-m4-status/);
  assert.match(html, /Transaction details/);
  assert.doesNotMatch(html, /wallet-panel/);
  assert.ok(
    html.indexOf('Decrypt with Keychain') < html.indexOf('1.000 HBD'),
    'message-reading action should precede payment metadata',
  );
});

test('UX-1E registers and profile-scopes its additive presentation asset', () => {
  const head = fs.readFileSync(path.join(ROOT, 'views/common/head.ejs'), 'utf8');
  const profile = fs.readFileSync(path.join(ROOT, 'views/pages/profile/index.ejs'), 'utf8');
  const assets = fs.readFileSync(path.join(ROOT, 'src/release/static-assets.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/css/ux-1e-messages.css'), 'utf8');

  assert.doesNotMatch(head, /\/css\/ux-1e-messages\.css/);
  assert.match(profile, /\/css\/ux-1e-messages\.css/);
  assert.match(assets, /'\/css\/ux-1e-messages\.css'/);
  for (const selector of [
    '.message-entry',
    '.message-entry__avatar',
    '.message-entry__avatar--fallback',
    '.message-entry__body',
    '.message-entry__activity',
    '.message-entry__details',
    '.message-surface--inbox',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
