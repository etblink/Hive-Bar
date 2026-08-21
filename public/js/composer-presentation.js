'use strict';

(function attachComposerPresentation(global) {
  const dialogTriggers = new WeakMap();

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

  function updateByteCounter(input) {
    const maximum = Number(input.dataset.maxBytes);
    if (!Number.isInteger(maximum)) return;
    const parts = composerParts(input);
    if (!parts) return;
    const bytes = new TextEncoder().encode(input.value).byteLength;
    parts.counter.textContent = `${bytes.toLocaleString()} / ${maximum.toLocaleString()} used`;
    parts.counter.classList.toggle('composer__counter--over', bytes > maximum);
    parts.counter.classList.toggle('text-red-300', bytes > maximum);
    parts.counter.classList.toggle('text-gray-400', bytes <= maximum);
    input.setCustomValidity(
      bytes > maximum ? 'This text is too long. Shorten it and try again.' : '',
    );
  }

  function initialize(root = global.document) {
    if (!root?.querySelectorAll) return;
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
    global.setTimeout(() => first?.focus(), 0);
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

  global.HiveBarComposer = Object.freeze({ closeDialog, initialize, openDialog, updateByteCounter });
})(window);
