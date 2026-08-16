# M15.5 Visual Blocker 001 — Tablet Bottom Navigation

Status: **CORRECTED CANDIDATE — REVALIDATION REQUIRED**

## Observation

Owner visual review at a 768 CSS-pixel responsive viewport showed the primary application navigation rendering at the top of the screen rather than as the expected persistent bottom navigation.

The intended M15 shell contract is:

- mobile and tablet widths below 1024 CSS px: persistent bottom navigation;
- desktop widths at 1024 CSS px and above: persistent left rail.

## Root cause

The primary navigation was correctly authored as `position: fixed` with `bottom: 0`, but it is nested inside `.app-shell-header`.

The sticky header also used `backdrop-filter: blur(16px)`. In browsers where a filtered ancestor establishes the containing block for fixed-position descendants, the navigation's fixed positioning became relative to the header rather than the viewport. That caused the bottom navigation to appear at the bottom of the top header.

## Correction

The header now carries the local Tailwind arbitrary-property utility `[backdrop-filter:none]`.

This is intentionally narrow:

- the header remains sticky;
- the navigation remains `position: fixed; bottom: 0` below 1024 px;
- the navigation keeps its own translucent/backdrop treatment;
- the desktop rail transition remains at `min-width: 1024px`;
- no inline style is introduced;
- no route, capability, Hive write, Keychain, payment, release, or production behavior changes.

## Regression gate

`test/m15-nav-placement-regression.test.js` binds the correction by checking:

- the header's no-filter override is present;
- no inline style is used for the correction;
- mobile/tablet navigation remains fixed to the viewport bottom in source CSS;
- desktop static navigation begins only inside the 1024 px media query;
- the compiled stylesheet contains the no-filter override.

## Acceptance impact

The prior M15.5 visual review is **not a PASS**. This blocker must be revalidated in CI and then visually rechecked at 768 px, with spot checks at 360/390 px and 1024 px to confirm the intended breakpoint transition.
