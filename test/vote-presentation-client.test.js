'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const voteClient = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'vote-presentation.js'),
  'utf8',
);
const socialClient = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'social-actions.js'),
  'utf8',
);

function voteForm(id, author, permlink) {
  return `<form data-social-action="vote" data-signer-mode="keychain" data-vote-control data-vote-direction-state="neutral">
    <input type="hidden" name="author" value="${author}">
    <input type="hidden" name="permlink" value="${permlink}">
    <fieldset>
      <label><input id="${id}-upvote" type="radio" name="direction" value="upvote" required data-vote-direction>Upvote</label>
      <label><input id="${id}-downvote" type="radio" name="direction" value="downvote" required data-vote-direction>Downvote</label>
    </fieldset>
    <label for="${id}-percent">Strength</label>
    <input id="${id}-percent" type="range" name="percent" value="100" min="1" max="100" step="1" aria-valuetext="100 percent" data-vote-strength>
    <output for="${id}-percent" data-vote-percent>100%</output>
    <button type="submit" data-vote-review>Review vote</button>
    <p data-social-status></p>
  </form>`;
}

function browser() {
  const dom = new JSDOM(
    `<!doctype html>${voteForm('root-vote', 'etblink', 'welcome')}${voteForm('comment-vote', 'barfriend', 'reply')}`,
    { runScripts: 'outside-only', url: 'https://fourthstreetbar.com/post/etblink/welcome' },
  );
  dom.window.eval(voteClient);
  dom.window.eval(socialClient);
  return dom;
}

function payload(dom, form) {
  return JSON.parse(JSON.stringify(dom.window.HiveBarSocial.formPayload(form)));
}

function setStrength(dom, form, value) {
  const range = form.querySelector('[data-vote-strength]');
  range.value = String(value);
  range.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('direct vote controls serialize a neutral 100% default and remain isolated by form', () => {
  const dom = browser();
  const [root, comment] = dom.window.document.querySelectorAll('[data-vote-control]');
  try {
    for (const form of [root, comment]) {
      assert.equal(form.dataset.voteDirectionState, 'neutral');
      assert.equal(form.querySelector('[data-vote-direction]:checked'), null);
      assert.equal(form.querySelector('[data-vote-strength]').value, '100');
      assert.equal(form.querySelector('[data-vote-strength]').getAttribute('aria-valuetext'), '100 percent');
      assert.equal(form.querySelector('[data-vote-percent]').textContent, '100%');
      assert.equal(form.querySelector('[data-vote-review]').textContent, 'Review vote');
      assert.equal(form.checkValidity(), false);
    }

    root.querySelector('[value="upvote"]').click();
    setStrength(dom, root, 50);
    assert.equal(root.dataset.voteDirectionState, 'upvote');
    assert.equal(root.querySelector('[value="upvote"]').checked, true);
    assert.equal(root.querySelector('[value="downvote"]').checked, false);
    assert.equal(root.querySelector('[data-vote-percent]').textContent, '50%');
    assert.equal(root.querySelector('[data-vote-strength]').getAttribute('aria-valuetext'), '50 percent');
    assert.equal(root.querySelector('[data-vote-review]').textContent, 'Review upvote');
    assert.equal(root.checkValidity(), true);
    assert.deepEqual(payload(dom, root), {
      author: 'etblink',
      permlink: 'welcome',
      direction: 'upvote',
      percent: 50,
    });

    assert.equal(comment.dataset.voteDirectionState, 'neutral');
    assert.equal(comment.querySelector('[data-vote-direction]:checked'), null);
    assert.equal(comment.querySelector('[data-vote-percent]').textContent, '100%');
    assert.equal(comment.querySelector('[data-vote-review]').textContent, 'Review vote');

    root.querySelector('[value="downvote"]').click();
    comment.querySelector('[value="upvote"]').click();
    setStrength(dom, comment, 25);
    assert.deepEqual(payload(dom, root), {
      author: 'etblink',
      permlink: 'welcome',
      direction: 'downvote',
      percent: 50,
    });
    assert.deepEqual(payload(dom, comment), {
      author: 'barfriend',
      permlink: 'reply',
      direction: 'upvote',
      percent: 25,
    });
  } finally {
    dom.window.close();
  }
});

test('pending confirmation labels are not overwritten by later vote presentation events', () => {
  const dom = browser();
  const form = dom.window.document.querySelector('[data-vote-control]');
  try {
    form.querySelector('[value="upvote"]').click();
    const review = form.querySelector('[data-vote-review]');
    review.textContent = 'Recheck Hive confirmation';
    setStrength(dom, form, 49);
    assert.equal(review.textContent, 'Recheck Hive confirmation');
    assert.equal(form.querySelector('[data-vote-percent]').textContent, '49%');
  } finally {
    dom.window.close();
  }
});

test('review cancellation sends no Keychain request and leaves the selected vote usable', async () => {
  const dom = browser();
  const form = dom.window.document.querySelector('[data-vote-control]');
  form.querySelector('[value="downvote"]').click();
  setStrength(dom, form, 50);
  const requests = [];
  let broadcasts = 0;
  const preflight = {
    id: 'ux-1c-preflight',
    account: 'etblink',
    signer: 'etblink',
    action: 'vote',
    authority: 'Posting',
    operations: [['vote', { voter: 'etblink', author: 'etblink', permlink: 'welcome', weight: -5000 }]],
    fingerprint: 'f'.repeat(64),
    summary: { kind: 'Downvote', direction: 'downvote', percent: 50, weight: -5000 },
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
    assert.deepEqual(JSON.parse(prepared.options.body), {
      author: 'etblink',
      permlink: 'welcome',
      direction: 'downvote',
      percent: 50,
    });
    assert.equal(broadcasts, 0);
    assert.equal(form.querySelector('[data-vote-review]').disabled, false);
    assert.equal(form.querySelector('[value="downvote"]').checked, true);
    assert.equal(form.querySelector('[data-vote-strength]').value, '50');
    assert.equal(form.querySelector('[data-vote-percent]').textContent, '50%');
    assert.match(form.querySelector('[data-social-status]').textContent, /Nothing was sent to Hive/);
  } finally {
    dom.window.close();
  }
});
