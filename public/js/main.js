'use strict';

function setActiveTab(button) {
  const group = button.closest('[data-tab-group]');
  if (!group) return;

  for (const tab of group.querySelectorAll('[data-tab-button]')) {
    const active = tab === button;
    tab.setAttribute('aria-selected', String(active));
    tab.classList.toggle('bg-bar-gold', active);
    tab.classList.toggle('text-black', active);
    tab.classList.toggle('bg-gray-700', !active);
    tab.classList.toggle('text-white', !active);
  }
}

document.addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab-button]');
  if (tab) setActiveTab(tab);
});

document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-community-sort]');
  if (!select) return;

  const community = select.dataset.communityId;
  const sort = encodeURIComponent(select.value);
  htmx.ajax('GET', `/community/${encodeURIComponent(community)}/community-posts?sort=${sort}`, {
    target: '#postContent',
    swap: 'innerHTML',
  });
});

document.addEventListener('htmx:responseError', (event) => {
  const target = event.detail?.target;
  if (target) target.setAttribute('aria-busy', 'false');
});
