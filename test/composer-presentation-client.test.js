'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { TextEncoder } = require('node:util');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const composerClient = fs.readFileSync(
  path.join(ROOT, 'public', 'js', 'composer-presentation.js'),
  'utf8',
);
const socialClient = fs.readFileSync(path.join(ROOT, 'public', 'js', 'social-actions.js'), 'utf8');
const m4Client = fs.readFileSync(path.join(ROOT, 'public', 'js', 'm4-actions.js'), 'utf8');

function response(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

function composerMarkup({ id, controller = 'social', action = 'comment', maximum = 8 }) {
  const actionAttribute = controller === 'social'
    ? `data-social-action="${action}" data-signer-mode="keychain"`
    : `data-m4-action="${action}"`;
  const statusAttribute = controller === 'social' ? 'data-social-status' : 'data-m4-status';
  return `
    <section data-composer="${id}">
      <form data-composer-form="${id}" ${actionAttribute}>
        <div data-composer-field="${id}-body">
          <label for="${id}-body">Message</label>
          <textarea id="${id}-body" name="body" data-composer-input data-max-bytes="${maximum}"></textarea>
          <p id="${id}-body-counter" data-byte-counter></p>
        </div>
        <button type="submit">Review</button>
        <p id="${id}-status" ${statusAttribute}></p>
      </form>
    </section>`;
}

function documentFixture() {
  const dom = new JSDOM(`<!doctype html><body>
    ${composerMarkup({ id: 'reply-one' })}
    ${composerMarkup({ id: 'reply-two' })}
    ${composerMarkup({ id: 'wall-one', controller: 'm4', action: 'wall' })}
    ${composerMarkup({ id: 'wall-two', controller: 'm4', action: 'wall' })}
  </body>`, {
    runScripts: 'outside-only',
    url: 'https://hive-bar.test/community',
  });
  dom.window.TextEncoder = TextEncoder;
  dom.window.eval(composerClient);
  dom.window.eval(socialClient);
  dom.window.eval(m4Client);
  return dom;
}

test('shared composer byte feedback is UTF-8 exact and isolated to its field and form', () => {
  const dom = documentFixture();
  const { document, Event } = dom.window;
  const first = document.querySelector('#reply-one-body');
  const firstCounter = document.querySelector('#reply-one-body-counter');
  const secondCounter = document.querySelector('#reply-two-body-counter');
  const wallCounter = document.querySelector('#wall-one-body-counter');

  assert.equal(firstCounter.textContent, '0 / 8 used');
  assert.equal(secondCounter.textContent, '0 / 8 used');
  assert.equal(wallCounter.textContent, '0 / 8 used');

  first.value = '🍺🍺🍺';
  first.dispatchEvent(new Event('input', { bubbles: true }));

  assert.equal(firstCounter.textContent, '12 / 8 used');
  assert.equal(secondCounter.textContent, '0 / 8 used');
  assert.equal(wallCounter.textContent, '0 / 8 used');
  assert.equal(first.validationMessage, 'This text is too long. Shorten it and try again.');
  assert.equal(firstCounter.classList.contains('composer__counter--over'), true);
  assert.equal(
    firstCounter.closest('[data-composer-form]'),
    first.closest('[data-composer-form]'),
  );

  first.value = 'short';
  first.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(firstCounter.textContent, '5 / 8 used');
  assert.equal(first.validationMessage, '');
  assert.equal(firstCounter.classList.contains('composer__counter--over'), false);
  dom.window.close();
});

test('social and M4 controllers report status only inside the submitted composer', async () => {
  const dom = documentFixture();
  const { document } = dom.window;
  const unauthenticated = async () => response({ authenticated: false });
  const social = new dom.window.HiveBarSocial.SocialActionController({
    fetchImpl: unauthenticated,
    keychainFactory: () => { throw new Error('Keychain must not be reached'); },
  });
  const m4 = new dom.window.HiveBarM4.M4ActionController({
    fetchImpl: unauthenticated,
    keychainFactory: () => { throw new Error('Keychain must not be reached'); },
  });

  await social.run(document.querySelector('[data-composer-form="reply-one"]'));
  assert.match(document.querySelector('#reply-one-status').textContent, /Sign in with Hive Keychain/);
  assert.equal(document.querySelector('#reply-two-status').textContent, '');
  assert.equal(document.querySelector('#wall-one-status').textContent, '');

  await m4.run(document.querySelector('[data-composer-form="wall-one"]'));
  assert.match(document.querySelector('#wall-one-status').textContent, /Sign in with Hive Keychain/);
  assert.equal(document.querySelector('#wall-two-status').textContent, '');
  assert.equal(document.querySelector('#reply-two-status').textContent, '');
  dom.window.close();
});
