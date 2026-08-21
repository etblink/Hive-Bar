'use strict';

(function attachVotePresentation(global) {
  const REVIEW_LABELS = new Set(['Review vote', 'Review upvote', 'Review downvote']);
  const dialogTriggers = new WeakMap();

  function voteForm(element) {
    const form = element?.closest?.('[data-vote-control]');
    return form?.matches?.('form[data-social-action="vote"]') ? form : null;
  }

  function directionFor(form) {
    const value = form?.querySelector('[data-vote-direction-value]')?.value;
    return value === 'upvote' || value === 'downvote' ? value : null;
  }

  function refresh(form) {
    if (!form?.matches?.('[data-vote-control]')) return;
    const direction = directionFor(form);
    const strength = form.querySelector('[data-vote-strength]');
    const output = form.querySelector('[data-vote-percent]');
    const review = form.querySelector('[data-vote-review]');
    const title = form.querySelector('[data-vote-dialog-title]');

    form.dataset.voteDirectionState = direction || 'neutral';
    if (strength && output) {
      const percent = Number(strength.value);
      if (Number.isInteger(percent)) {
        output.value = `${percent}%`;
        output.textContent = `${percent}%`;
        strength.setAttribute('aria-valuetext', `${percent} percent`);
      }
    }
    if (review && REVIEW_LABELS.has(review.textContent.trim())) {
      review.textContent = direction ? `Review ${direction}` : 'Review vote';
    }
    if (title) {
      title.textContent = direction === 'downvote'
        ? 'Choose downvote strength'
        : direction === 'upvote'
          ? 'Choose upvote strength'
          : 'Choose vote strength';
    }
  }

  function open(form, direction, trigger) {
    const input = form?.querySelector('[data-vote-direction-value]');
    const dialog = form?.querySelector('[data-vote-dialog]');
    if (!input || !dialog || typeof dialog.showModal !== 'function') return false;
    if (direction !== 'upvote' && direction !== 'downvote') return false;
    input.value = direction;
    dialogTriggers.set(dialog, trigger);
    refresh(form);
    dialog.showModal();
    global.setTimeout(() => form.querySelector('[data-vote-strength]')?.focus(), 0);
    return true;
  }

  function close(button) {
    const dialog = button.closest('[data-vote-dialog]');
    if (dialog?.open) dialog.close('cancel');
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-vote-open]');
    if (trigger) {
      event.preventDefault();
      const form = voteForm(trigger);
      if (form) open(form, trigger.dataset.voteOpen, trigger);
      return;
    }
    const closeButton = event.target.closest?.('[data-vote-close]');
    if (closeButton) close(closeButton);
  });

  document.addEventListener('input', (event) => {
    if (!event.target.matches?.('[data-vote-strength]')) return;
    const form = voteForm(event.target);
    if (form) refresh(form);
  });

  document.addEventListener('close', (event) => {
    const dialog = event.target;
    if (!dialog.matches?.('[data-vote-dialog]')) return;
    const form = voteForm(dialog);
    const trigger = dialogTriggers.get(dialog);
    dialogTriggers.delete(dialog);
    if (form) {
      const input = form.querySelector('[data-vote-direction-value]');
      if (input) input.value = '';
      refresh(form);
    }
    global.setTimeout(() => trigger?.focus(), 0);
  }, true);

  for (const form of document.querySelectorAll('[data-vote-control]')) refresh(form);

  global.HiveBarVotePresentation = Object.freeze({ close, directionFor, open, refresh });
})(window);
