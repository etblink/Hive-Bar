'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const voteClient = fs.readFileSync(path.join(ROOT, 'public', 'js', 'vote-presentation.js'), 'utf8');
const socialClient = fs.readFileSync(path.join(ROOT, 'public', 'js', 'social-actions.js'), 'utf8');

function voteForm(id, author, permlink) {
  return `<form data-social-action="vote" data-signer-mode="keychain" data-vote-control data-vote-direction-state="neutral">
    <input type="hidden" name="author" value="${author}">
    <input type="hidden" name="permlink" value="${permlink}">
    <input type="hidden" name="direction" value="" data-vote-direction-value>
    <button type="button" data-vote-open="upvote" aria-controls="${id}-dialog">Upvote</button>
    <button type="button" data-vote-open="downvote" aria-controls="${id}-dialog">Downvote</button>
    <dialog id="${id}-dialog" data-vote-dialog>
      <h2 data-vote-dialog-title>Choose vote strength</h2>
      <button type="button" data-vote-close>Close</button>
      <label for="${id}-percent">Strength</label>
      <input id="${id}-percent" type="range" name="percent" value="100" min="1" max="100" step="1" aria-valuetext="100 percent" data-vote-strength>
      <output for="${id}-percent" data-vote-percent>100%</output>
      <button type="submit" data-vote-review>Review vote</button>
      <p data-social-status></p>
    </dialog>
  </form>`;
}

function browser() {
  const dom = new JSDOM(`<!doctype html>${voteForm('root-vote', 'etblink', 'welcome')}${voteForm('comment-vote', 'barfriend', 'reply')}`,
    { runScripts: 'outside-only', url: 'https://fourthstreetbar.com/post/etblink/welcome' });
  for (const dialog of dom.window.document.querySelectorAll('dialog')) {
    dialog.showModal = () => { dialog.open = true; dialog.setAttribute('open', ''); };
    dialog.close = () => {
      dialog.open = false;
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new dom.window.Event('close'));
    };
  }
  dom.window.eval(voteClient);
  dom.window.eval(socialClient);
  return dom;
}

function payload(dom, form) { return JSON.parse(JSON.stringify(dom.window.HiveBarSocial.formPayload(form))); }
function setStrength(dom, form, value) {
  const range = form.querySelector('[data-vote-strength]');
  range.value = String(value);
  range.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

test('focused vote triggers choose direction, open one contextual dialog, and remain isolated by form', async () => {
  const dom = browser();
  const [root, comment] = dom.window.document.querySelectorAll('[data-vote-control]');
  try {
    for (const form of [root, comment]) {
      assert.equal(form.dataset.voteDirectionState, 'neutral');
      assert.equal(form.querySelector('[name="direction"]').value, '');
      assert.equal(form.querySelector('[data-vote-strength]').value, '100');
      assert.equal(form.querySelector('[data-vote-percent]').textContent, '100%');
      assert.equal(form.querySelector('[data-vote-review]').textContent, 'Review vote');
      assert.equal(form.querySelector('[data-vote-dialog]').open, false);
    }

    root.querySelector('[data-vote-open="upvote"]').click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    setStrength(dom, root, 50);
    assert.equal(root.dataset.voteDirectionState, 'upvote');
    assert.equal(root.querySelector('[name="direction"]').value, 'upvote');
    assert.equal(root.querySelector('[data-vote-dialog]').open, true);
    assert.equal(root.querySelector('[data-vote-percent]').textContent, '50%');
    assert.equal(root.querySelector('[data-vote-review]').textContent, 'Review upvote');
    assert.deepEqual(payload(dom, root), { author: 'etblink', permlink: 'welcome', direction: 'upvote', percent: 50 });

    assert.equal(comment.dataset.voteDirectionState, 'neutral');
    comment.querySelector('[data-vote-open="downvote"]').click();
    setStrength(dom, comment, 25);
    assert.deepEqual(payload(dom, comment), { author: 'barfriend', permlink: 'reply', direction: 'downvote', percent: 25 });
    assert.deepEqual(payload(dom, root), { author: 'etblink', permlink: 'welcome', direction: 'upvote', percent: 50 });
  } finally { dom.window.close(); }
});

test('closing the contextual vote dialog sends no request and returns the form to neutral', () => {
  const dom = browser();
  const form = dom.window.document.querySelector('[data-vote-control]');
  try {
    form.querySelector('[data-vote-open="downvote"]').click();
    assert.equal(form.querySelector('[name="direction"]').value, 'downvote');
    form.querySelector('[data-vote-close]').click();
    assert.equal(form.querySelector('[name="direction"]').value, '');
    assert.equal(form.dataset.voteDirectionState, 'neutral');
    assert.equal(form.querySelector('[data-vote-review]').textContent, 'Review vote');
  } finally { dom.window.close(); }
});

test('review cancellation sends no Keychain request and leaves the focused vote usable', async () => {
  const dom = browser();
  const form = dom.window.document.querySelector('[data-vote-control]');
  form.querySelector('[data-vote-open="downvote"]').click();
  setStrength(dom, form, 50);
  const requests = [];
  let broadcasts = 0;
  const preflight = {
    id: 'ux-1c-preflight', account: 'etblink', signer: 'etblink', action: 'vote', authority: 'Posting',
    operations: [['vote', { voter: 'etblink', author: 'etblink', permlink: 'welcome', weight: -5000 }]],
    fingerprint: 'f'.repeat(64), summary: { kind: 'Downvote', direction: 'downvote', percent: 50, weight: -5000 },
  };
  const controller = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === '/auth/session') return response({ authenticated: true, csrfToken: 'csrf-1' });
      if (url === '/api/social/preflight/vote') return response(preflight, 201);
      if (url.endsWith('/cancel')) return response(null, 204);
      throw new Error(`Unexpected URL ${url}`);
    },
    review: async () => false,
    keychainFactory: () => ({ async broadcast() { broadcasts += 1; } }),
  });
  try {
    await controller.run(form);
    const prepared = requests.find(({ url }) => url === '/api/social/preflight/vote');
    assert.deepEqual(JSON.parse(prepared.options.body), { author: 'etblink', permlink: 'welcome', direction: 'downvote', percent: 50 });
    assert.equal(broadcasts, 0);
    assert.match(form.querySelector('[data-social-status]').textContent, /Nothing was sent to Hive/);
    assert.equal(form.querySelector('[name="direction"]').value, 'downvote');
    assert.equal(form.querySelector('[data-vote-strength]').value, '50');
  } finally { dom.window.close(); }
});
