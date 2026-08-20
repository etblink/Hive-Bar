'use strict';

(function attachVotePresentation(global) {
  const REVIEW_LABELS = new Set(['Review vote', 'Review upvote', 'Review downvote']);

  function voteForm(element) {
    const form = element?.closest?.('[data-vote-control]');
    return form?.matches?.('form[data-social-action="vote"]') ? form : null;
  }

  function refresh(form) {
    if (!form?.matches?.('[data-vote-control]')) return;
    const selected = form.querySelector('[data-vote-direction]:checked');
    const strength = form.querySelector('[data-vote-strength]');
    const output = form.querySelector('[data-vote-percent]');
    const review = form.querySelector('[data-vote-review]');
    const direction = selected?.value === 'downvote'
      ? 'downvote'
      : selected?.value === 'upvote'
        ? 'upvote'
        : null;

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
  }

  document.addEventListener('change', (event) => {
    if (!event.target.matches?.('[data-vote-direction]')) return;
    const form = voteForm(event.target);
    if (form) refresh(form);
  });

  document.addEventListener('input', (event) => {
    if (!event.target.matches?.('[data-vote-strength]')) return;
    const form = voteForm(event.target);
    if (form) refresh(form);
  });

  for (const form of document.querySelectorAll('[data-vote-control]')) refresh(form);

  global.HiveBarVotePresentation = Object.freeze({ refresh });
})(window);
