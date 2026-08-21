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

function wallPrivacyMarkup() {
  return `
    <section data-composer="wall-unified">
      <p data-wall-privacy-kicker>Wall message</p>
      <h2 data-wall-privacy-title>Post a public message</h2>
      <p data-wall-privacy-description>Public description</p>
      <p data-wall-privacy-meta>1.000 HBD · Public on Hive</p>
      <form data-composer-form="wall-unified" data-m4-action="wall" data-wall-privacy-form data-wall-enabled="true" data-inbox-enabled="true">
        <input type="hidden" name="recipient" value="etblink">
        <input type="hidden" name="expectedFee" value="1.000 HBD">
        <input type="hidden" name="amount" value="1.000 HBD">
        <div data-composer-field="wall-encrypt-message">
          <label for="wall-encrypt-message"><input id="wall-encrypt-message" type="checkbox" data-composer-input data-wall-privacy-toggle>Encrypt this message (private)</label>
        </div>
        <div data-composer-field="wall-message">
          <label for="wall-message">Message</label>
          <textarea id="wall-message" name="message" data-composer-input data-wall-privacy-message data-max-bytes="2000"></textarea>
          <p id="wall-message-counter" data-byte-counter></p>
        </div>
        <button type="submit" data-wall-privacy-submit>Review message and 1.000 HBD payment</button>
        <p data-wall-privacy-disclosure>Public disclosure</p>
        <p id="wall-unified-status" data-m4-status></p>
      </form>
    </section>`;
}

function documentFixture({ unifiedWall = false } = {}) {
  const dom = new JSDOM(`<!doctype html><body>
    ${composerMarkup({ id: 'reply-one' })}
    ${composerMarkup({ id: 'reply-two' })}
    ${composerMarkup({ id: 'wall-one', controller: 'm4', action: 'wall' })}
    ${composerMarkup({ id: 'wall-two', controller: 'm4', action: 'wall' })}
    ${unifiedWall ? wallPrivacyMarkup() : ''}
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

test('C2-B.1 Wall privacy toggle selects existing wall or inbox action and enforces dynamic byte limit', () => {
  const dom = documentFixture({ unifiedWall: true });
  const { document, Event } = dom.window;
  const form = document.querySelector('[data-wall-privacy-form]');
  const toggle = form.querySelector('[data-wall-privacy-toggle]');
  const message = form.querySelector('[data-wall-privacy-message]');
  const counter = document.querySelector('#wall-message-counter');

  assert.equal(form.dataset.m4Action, 'wall');
  assert.equal(form.dataset.wallPrivacyMode, 'public');
  assert.equal(message.dataset.maxBytes, '2000');
  assert.equal(counter.textContent, '0 / 2,000 used');
  assert.equal(document.querySelector('[data-wall-privacy-kicker]').textContent, 'Wall message');
  assert.match(document.querySelector('[data-wall-privacy-title]').textContent, /public message/i);

  message.value = 'x'.repeat(1600);
  message.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(message.validationMessage, '');

  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(form.dataset.m4Action, 'inbox');
  assert.equal(form.dataset.wallPrivacyMode, 'private');
  assert.equal(message.dataset.maxBytes, '1500');
  assert.equal(counter.textContent, '1,600 / 1,500 used');
  assert.equal(message.validationMessage, 'This text is too long. Shorten it and try again.');
  assert.equal(document.querySelector('[data-wall-privacy-kicker]').textContent, 'Private message');
  assert.match(document.querySelector('[data-wall-privacy-title]').textContent, /private message/i);
  assert.match(document.querySelector('[data-wall-privacy-submit]').textContent, /Encrypt & review payment/);
  assert.match(document.querySelector('[data-wall-privacy-disclosure]').textContent, /message text stays private/i);

  message.value = 'private hello';
  message.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(message.validationMessage, '');

  toggle.checked = false;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(form.dataset.m4Action, 'wall');
  assert.equal(message.dataset.maxBytes, '2000');
  assert.equal(document.querySelector('[data-wall-privacy-kicker]').textContent, 'Wall message');
  assert.match(document.querySelector('[data-wall-privacy-disclosure]').textContent, /permanently public on Hive/i);
  dom.window.close();
});

test('C2-B.2 dialog opening establishes focus synchronously and never steals later patron focus', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <section data-composer-dialog-shell>
      <button id="open" type="button" data-composer-dialog-trigger>Open</button>
      <dialog data-composer-dialog>
        <input id="first-control" type="checkbox" data-composer-input>
        <textarea id="message-control" data-composer-input></textarea>
      </dialog>
    </section>
  </body>`, {
    runScripts: 'outside-only',
    url: 'https://hive-bar.test/profile/etblink/wall-posts',
  });
  dom.window.TextEncoder = TextEncoder;
  const { document } = dom.window;
  const dialog = document.querySelector('[data-composer-dialog]');
  dialog.showModal = () => dialog.setAttribute('open', '');
  dom.window.eval(composerClient);

  const trigger = document.querySelector('#open');
  const message = document.querySelector('#message-control');
  assert.equal(dom.window.HiveBarComposer.openDialog(trigger), true);
  assert.equal(document.activeElement.id, 'first-control');

  message.focus();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  assert.equal(document.activeElement.id, 'message-control');
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
