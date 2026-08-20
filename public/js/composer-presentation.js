'use strict';

(function attachComposerPresentation(global) {
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

  document.addEventListener('input', (event) => {
    const input = event.target.closest?.('[data-composer-input][data-max-bytes]');
    if (input) updateByteCounter(input);
  });
  for (const input of document.querySelectorAll('[data-composer-input][data-max-bytes]')) {
    updateByteCounter(input);
  }

  global.HiveBarComposer = Object.freeze({ updateByteCounter });
})(window);
