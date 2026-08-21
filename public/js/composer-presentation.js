'use strict';

(function attachComposerPresentation(global) {
  const dialogTriggers = new WeakMap();
  const WALL_PUBLIC_LIMIT = 2000;
  const WALL_PRIVATE_LIMIT = 1500;

  function composerParts(input) {
    const field = input.closest('[data-composer-field]');
    const form = input.closest('[data-composer-form]');
    if (!field || !form || !form.contains(field)) return null;
    const counter = field.querySelector('[data-byte-counter]');
    if (
      !counter ||
      counter.closest('[data-composer-field]') !== field ||
      counter.closest('[data-composer-form]') !== form
    ) {
      return null;
    }
    return { counter, field, form };
  }

  function utf8Bytes(value) {
    return new global.TextEncoder().encode(String(value || '')).byteLength;
  }

  function updateByteCounter(input) {
    const maximum = Number(input.dataset.maxBytes);
    if (!Number.isInteger(maximum)) return;
    const parts = composerParts(input);
    if (!parts) return;
    const bytes = utf8Bytes(input.value);
    parts.counter.textContent = `${bytes.toLocaleString()} / ${maximum.toLocaleString()} used`;
    parts.counter.classList.toggle('composer__counter--over', bytes > maximum);
    parts.counter.classList.toggle('text-red-300', bytes > maximum);
    parts.counter.classList.toggle('text-gray-400', bytes <= maximum);
    input.setCustomValidity(
      bytes > maximum ? 'This text is too long. Shorten it and try again.' : '',
    );
  }

  function setText(form, selector, value) {
    const element = form.closest('[data-composer]')?.querySelector(selector);
    if (element) element.textContent = value;
  }

  function updateWallPrivacy(form) {
    if (!form?.matches?.('[data-wall-privacy-form]')) return;
    const wallEnabled = form.dataset.wallEnabled === 'true';
    const inboxEnabled = form.dataset.inboxEnabled === 'true';
    const toggle = form.querySelector('[data-wall-privacy-toggle]');
    const message = form.querySelector('[data-wall-privacy-message]');
    if (!message || (!wallEnabled && !inboxEnabled)) return;

    let privateMode = !wallEnabled && inboxEnabled;
    if (toggle) {
      if (!wallEnabled && inboxEnabled) {
        toggle.checked = true;
        toggle.disabled = true;
      } else if (wallEnabled && inboxEnabled) {
        toggle.disabled = false;
      } else {
        toggle.checked = false;
        toggle.disabled = true;
      }
      privateMode = inboxEnabled && toggle.checked;
    }
    if (!wallEnabled) privateMode = inboxEnabled;
    if (!inboxEnabled) privateMode = false;

    const recipient = form.querySelector('input[name="recipient"]')?.value || '';
    const fee = form.querySelector('input[name="expectedFee"]')?.value || '';
    const maximum = privateMode ? WALL_PRIVATE_LIMIT : WALL_PUBLIC_LIMIT;
    form.dataset.m4Action = privateMode ? 'inbox' : 'wall';
    form.dataset.wallPrivacyMode = privateMode ? 'private' : 'public';
    message.dataset.maxBytes = String(maximum);
    message.placeholder = privateMode
      ? `Private message for @${recipient}`
      : `Write on @${recipient}’s Wall`;
    updateByteCounter(message);

    setText(form, '[data-wall-privacy-kicker]', privateMode ? 'Private message' : 'Wall message');
    setText(form, '[data-wall-privacy-title]', privateMode ? 'Send a private message' : 'Post a public message');
    setText(
      form,
      '[data-wall-privacy-description]',
      privateMode
        ? `Keychain encrypts this message for @${recipient} in this browser.`
        : `Write something for @${recipient} and everyone who visits this Wall.`,
    );
    setText(form, '[data-wall-privacy-meta]', `${fee} · ${privateMode ? 'Encrypted text' : 'Public on Hive'}`);
    setText(
      form,
      '[data-wall-privacy-submit]',
      privateMode ? 'Encrypt & review payment' : `Review message and ${fee} payment`,
    );
    setText(
      form,
      '[data-wall-privacy-disclosure]',
      privateMode
        ? 'Keychain encrypts the message in this browser. The message text stays private, but sender, recipient, HBD amount, time, and transaction remain public on Hive. Encryption happens before review.'
        : 'The message, sender, recipient, payment, and transaction are permanently public on Hive. You’ll review the recipient, message, fee, and payment before Keychain asks for approval.',
    );
  }

  function initialize(root = global.document) {
    if (!root?.querySelectorAll) return;
    const wallForms = [];
    if (root.matches?.('[data-wall-privacy-form]')) wallForms.push(root);
    wallForms.push(...root.querySelectorAll('[data-wall-privacy-form]'));
    for (const form of wallForms) updateWallPrivacy(form);
    for (const input of root.querySelectorAll('[data-composer-input][data-max-bytes]')) {
      updateByteCounter(input);
    }
  }

  function openDialog(trigger) {
    const shell = trigger.closest('[data-composer-dialog-shell]');
    const dialog = shell?.querySelector(':scope > [data-composer-dialog]');
    if (!dialog || typeof dialog.showModal !== 'function') return false;
    dialogTriggers.set(dialog, trigger);
    dialog.showModal();
    const first = dialog.querySelector('[data-composer-input]');
    first?.focus();
    return true;
  }

  function closeDialog(button) {
    const dialog = button.closest('[data-composer-dialog]');
    if (dialog?.open) dialog.close('cancel');
  }

  global.document.addEventListener('input', (event) => {
    const input = event.target.closest?.('[data-composer-input][data-max-bytes]');
    if (input) updateByteCounter(input);
  });
  global.document.addEventListener('change', (event) => {
    const toggle = event.target.closest?.('[data-wall-privacy-toggle]');
    if (toggle) updateWallPrivacy(toggle.closest('[data-wall-privacy-form]'));
  });
  global.document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-composer-dialog-trigger]');
    if (trigger) {
      if (trigger.tagName !== 'SUMMARY') event.preventDefault();
      openDialog(trigger);
      return;
    }
    const close = event.target.closest?.('[data-composer-dialog-close]');
    if (close) closeDialog(close);
  });
  global.document.addEventListener('close', (event) => {
    const dialog = event.target;
    if (!dialog.matches?.('[data-composer-dialog]')) return;
    const trigger = dialogTriggers.get(dialog);
    dialogTriggers.delete(dialog);
    global.setTimeout(() => trigger?.focus(), 0);
  }, true);
  global.document.addEventListener('htmx:afterSwap', (event) => {
    initialize(event.detail?.target || event.target);
  });
  initialize();

  global.HiveBarComposer = Object.freeze({
    closeDialog,
    initialize,
    openDialog,
    updateByteCounter,
    updateWallPrivacy,
    utf8Bytes,
  });
})(window);
