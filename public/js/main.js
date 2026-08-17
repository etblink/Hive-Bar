'use strict';

function revealSignInFromHash() {
  if (globalThis.location.hash !== '#hive-sign-in') return;
  const details = document.querySelector('#hive-sign-in');
  if (!details) return;
  details.open = true;
  const account = details.querySelector('input[name="account"]');
  globalThis.requestAnimationFrame(() => account?.focus());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', revealSignInFromHash, { once: true });
} else {
  revealSignInFromHash();
}
globalThis.addEventListener('hashchange', revealSignInFromHash);

function setActiveContentLink(link) {
  const navigation = link.closest('nav');
  if (!navigation) return;

  for (const candidate of navigation.querySelectorAll('.content-tab')) {
    const active = candidate === link;
    candidate.classList.toggle('content-tab--active', active);
    if (active) candidate.setAttribute('aria-current', 'page');
    else candidate.removeAttribute('aria-current');
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('.content-tab');
  if (link) setActiveContentLink(link);
});

document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-community-sort]');
  const form = select?.closest('form');
  if (form) form.requestSubmit();
});

document.addEventListener('htmx:beforeSwap', (event) => {
  if (event.detail.xhr.status >= 400) {
    event.detail.shouldSwap = true;
    event.detail.isError = false;
  }
});

document.addEventListener('htmx:beforeRequest', (event) => {
  const target = event.detail?.target;
  if (target) target.setAttribute('aria-busy', 'true');
});

document.addEventListener('htmx:afterRequest', (event) => {
  const target = event.detail?.target;
  if (target) target.setAttribute('aria-busy', 'false');
});

document.addEventListener('htmx:responseError', (event) => {
  const target = event.detail?.target;
  if (target) target.setAttribute('aria-busy', 'false');
});
