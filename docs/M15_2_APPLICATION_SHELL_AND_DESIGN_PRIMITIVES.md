# Hive-Bar M15.2 Application Shell and Design Primitives

Status: **CORRECTED CANDIDATE IMPLEMENTATION — OWNER REVIEW REQUIRED**

## 1. Binding

M15.2 is rooted directly at the accepted M15.0/M15.1 source of truth:

- branch: `codex/m6-read-only-release-readiness`
- parent commit: `f83bcb7bdf6784151405766ee442142d61116e26`
- parent tree: `6fe449ebea25591353dde5ca4b589cf05276948d`
- governing UI/UX specification: `docs/HIVE_BAR_M15_UI_UX_MODERNIZATION_SPECIFICATION_0_1_0.md`

This milestone is presentation-only. It does not authorize or perform a Privex deployment, Hive write, Keychain transaction request, payment-window activation, payment-semantic change, Distriator activation, DNS/Cloudflare/Caddy change, or PR #1 mutation.

## 2. Purpose

M15.2 establishes the shared visual and navigation shell that later M15 surfaces will inherit. It changes the application frame before redesigning Home, Community, Conversation, Profile, Wallet, or Pay individually.

The implementation preserves the accepted server-rendered EJS + HTMX architecture. No new client-side application framework, route family, Hive RPC primitive, signing primitive, or persistence layer is introduced.

## 3. Implemented shell

### 3.1 Mobile

The persistent mobile bottom navigation presents the approved five-slot model:

`Home · Explore · Create · Pay · You`

Current state in M15.2:

- **Home** — active link to the existing `/` route.
- **Explore** — truthful disabled shell destination. No `/explore` route is created.
- **Create** — truthful disabled shell destination. No `/create` route is created and no write authority is inferred.
- **Pay** — active link to the existing `/pay` route.
- **You** — verified-session profile link when signed in; when signed out, the item opens the existing Keychain sign-in form.

The existing Community route remains reachable from application content and becomes a dedicated navigation item at desktop widths. It is intentionally not a sixth mobile bottom-nav slot.

### 3.2 Desktop

At 1024 CSS px and wider the same primary navigation becomes a persistent 17 rem left rail. The rail adds the current `/community` destination and keeps Explore/Create visibly unavailable rather than inventing behavior.

The desktop rail contains:

- primary venue/application identity;
- Home;
- disabled Explore;
- disabled Create;
- Community;
- Pay;
- You;
- verified account/sign-out state when signed in;
- restrained `Hive-Bar · Powered by Hive` attribution.

### 3.3 Current-state treatment

The shell derives current navigation state from the page title already supplied by accepted routes. It does not add request middleware or alter route semantics.

- Home is current on the existing home document.
- Community is current on Community and Threads documents.
- Pay is current on Pay Tab.
- You is current only for the verified session owner's profile-family documents.
- Other profile and conversation views may intentionally have no highlighted primary destination.

## 4. Design primitives

`src/input.css` exposes the approved semantic token vocabulary:

```text
--hb-bg
--hb-surface
--hb-surface-raised
--hb-surface-strong
--hb-border
--hb-text
--hb-text-muted
--hb-text-subtle
--hb-accent
--hb-accent-hover
```

The accepted Bar Gold remains `#F4A460`.

Additional primitives establish:

- 4 px-based spacing tokens;
- control/panel/media radius tokens;
- 44 CSS px minimum interactive targets;
- responsive content-frame and social-column widths;
- app surface, raised surface, divider, title, section-title, kicker, chip, and icon-button classes;
- safe-area-aware mobile bottom navigation;
- fixed desktop rail layout;
- system UI sans typography without an external font dependency;
- reduced-motion preservation.

Existing button, content-tab, state-card, comment-card, and wallet-panel primitives are aligned to semantic surfaces without changing associated application behaviors.

## 5. Capability honesty

M15.2 intentionally does **not** activate mockup-only concepts.

The shell does not expose active:

- Live;
- Events;
- Following feed;
- global search;
- recommendations;
- notifications;
- venue presence/check-ins.

Explore and Create are present only as disabled information-architecture positions. Tests require that neither `/explore` nor `/create` exists yet.

## 6. Authentication and signing boundary

Signed-out `You` contains the same browser-local Hive Keychain authentication form and the same explicit warning never to enter a private key.

Signed-in `You` resolves to the verified session account and retains an explicit sign-out action.

M15.2 does not:

- move private-key handling to the server;
- create a signing request;
- bypass preflight/review flows;
- enable a social action;
- enable a payment action;
- change any accepted authority requirement.

## 7. Exact logo asset

The corrected candidate integrates the exact owner-supplied distressed 4th Street Bar logo rather than a generated or redrawn approximation.

Repository path:

`public/images/fourth-street-bar-logo.jpg`

Verified source identity:

- format: JPEG
- dimensions: 720 × 720
- size: 34,268 bytes
- SHA-256: `c57379e4dc46a367879fc0dc67b61b5514ede4fd795cfbbc0ea116914cea91da`

The header loads only this local asset. The image is decorative within an already labelled home link, so its `alt` value remains empty and the adjacent `4th Street Bar` text supplies the accessible venue name.

The logo is intentionally compact on mobile and approximately 96 CSS px on desktop so it anchors the venue identity without dominating the rail.

## 8. Security-compatible navigation icons

The first M15.2 candidate used inline SVG navigation glyphs. Existing repository security regression tests intentionally reject rendered `<svg>`, `<iframe>`, `<object>`, and `<embed>` markup in protected documents. M15.2 preserves that invariant.

The corrected candidate removes all inline SVG from the shared shell. Navigation glyphs are presentation-only, `aria-hidden` Unicode line symbols paired with visible text labels. No executable or externally loaded icon markup is introduced.

This is a deliberate security-preserving design choice; the old security assertion is not weakened.

## 9. Accessibility and responsive invariants

The corrected shell preserves:

- skip-to-content navigation;
- semantic `header` and primary `nav`;
- visible text labels for every primary destination;
- `aria-current="page"` on current destinations;
- `aria-disabled="true"` on non-functional Explore/Create destinations;
- a native `details/summary` Keychain sign-in control;
- visible focus treatment;
- minimum 44 px action targets;
- 320 px document support;
- safe-area padding on mobile;
- reduced-motion handling;
- no externally hosted font dependency;
- no inline SVG in rendered shell markup.

The existing `header nav ul.flex-wrap` structural contract remains intentionally compatible while the list itself adopts the M15 shell classes.

## 10. Automated M15.2 checks

`test/m15-shell-primitives.test.js` verifies:

1. the exact shell destination set;
2. Explore/Create are disabled and have no routes;
3. Community remains an existing desktop destination;
4. signed-out `You` exposes the real Keychain sign-in form;
5. signed-in `You` binds to the verified session and keeps sign-out explicit;
6. semantic design tokens are present;
7. the five-column mobile navigation and 1024 px desktop rail contracts are present;
8. safe-area, 44 px target, and reduced-motion contracts remain present;
9. no external font URL import is added;
10. Live/Events/Following are absent from the shell;
11. the exact local logo byte length and SHA-256 match the owner-supplied file;
12. the rendered header references only the local logo path;
13. the shared shell renders no inline SVG.

All pre-existing CI gates remain authoritative.

## 11. Corrective-pass provenance

The initial PR #6 head exposed three deterministic CI failures:

- two pre-existing executable-markup regressions because the new header contained inline SVG;
- one M15.2 test that read the full signed-out `You` disclosure subtree instead of only the visible nav label.

The corrected candidate:

- removes inline SVG rather than weakening security tests;
- adds explicit `.app-nav-label` elements and tests only those labels;
- integrates and hash-binds the exact owner-supplied logo;
- preserves all existing route, Hive, Keychain, payment, and production boundaries.

The temporary PR branch is intentionally rewritten to one corrected commit rooted directly at the accepted M15.0/M15.1 parent so the final candidate history is unambiguous.

## 12. Files changed in corrected candidate

- `views/common/header.ejs`
- `src/input.css`
- `test/m15-shell-primitives.test.js`
- `docs/M15_2_APPLICATION_SHELL_AND_DESIGN_PRIMITIVES.md`
- `public/images/fourth-street-bar-logo.jpg`

No route, payment, social-action, release-gate, environment, operations, or deployment file is changed.

## 13. Acceptance gate

M15.2 source acceptance requires:

- exact parent remains `f83bcb7bdf6784151405766ee442142d61116e26`;
- candidate changes are limited to the five declared presentation/test/documentation/asset files;
- logo SHA-256 remains exactly `c57379e4dc46a367879fc0dc67b61b5514ede4fd795cfbbc0ea116914cea91da`;
- Ubuntu and Windows deterministic CI pass;
- existing security/accessibility/responsive tests pass;
- new M15.2 shell/logo tests pass;
- no `/explore` or `/create` functional route is introduced;
- no Hive/Keychain/payment behavior is changed;
- PR #1 remains untouched;
- production/Privex remains untouched.

After source acceptance, M15.3 may redesign core social surfaces under the approved specification. Deployment remains a separate authorization boundary.
