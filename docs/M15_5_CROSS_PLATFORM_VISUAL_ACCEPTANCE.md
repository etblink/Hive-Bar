# Hive-Bar M15.5 Cross-Platform and Visual Acceptance

Status: **CANDIDATE ACCEPTANCE HARNESS — AUTOMATED CROSS-PLATFORM VALIDATION REQUIRED; MANUAL VISUAL REVIEW REMAINS REQUIRED BEFORE FINAL M15.5 ACCEPTANCE**

## 1. Binding

M15.5 is rooted directly at the owner-accepted M15.4 source of truth:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `05f77741397520baa2acf4dceb0d3300bdb547e5`
- parent tree: `f4364fbd53eae1d77302651af0affd733f451332`
- candidate branch: `codex/m15-5-cross-platform-acceptance`
- governing specification: `docs/HIVE_BAR_M15_UI_UX_MODERNIZATION_SPECIFICATION_0_1_0.md`

This milestone is acceptance-only unless a gate exposes a defect. The intended candidate adds no application feature, no new route, no new Hive capability, and no new payment behavior.

## 2. Non-actions and security boundary

M15.5 does **not** authorize or perform:

- Privex deployment;
- DNS, Cloudflare, Caddy, firewall, TLS, or systemd changes;
- Hive writes or broadcasts;
- Hive Keychain transaction requests;
- payment-window activation;
- a genuine purchase;
- Distriator activation;
- modification of payment authority, receipt, observer, irreversible-confirmation, or no-retry semantics;
- modification of PR #1;
- activation of FUTURE M15 concepts such as Explore search, generic Create, Live, Events, Following feed, recommendations, presence, or notifications.

## 3. Automated cumulative acceptance

`test/m15-cross-platform-acceptance.test.js` binds M15.5 to the existing cumulative regression suite rather than replacing it.

The automated gate verifies that:

1. Public M15 surfaces render as complete documents with one `main#main-content`, viewport metadata, skip navigation, the accepted app shell, local stylesheets, local runtime scripts, and no executable inline script.
2. Signed-out Pay remains non-operational until verified sign-in.
3. A verified write-disabled session remains a truthful read-only state.
4. Controlled owner state exposes only already-accepted owner actions.
5. Controlled payment state exposes the existing Pay form without changing Active-authority or no-retry language.
6. The approved empty `@fourthst.threads` container remains an intentional sparse state.
7. Community feed failure remains an unavailable state without leaking internal errors.
8. Malformed pagination remains a bounded client error without stack traces.
9. `/explore` and `/create` remain nonexistent routes while their shell entries remain disabled, preventing mockup concepts from becoming accidental capabilities.
10. Source CSS retains the 320 px floor, safe-area handling, 44 px minimum interaction target, responsive transitions, desktop rail, and reduced-motion behavior.
11. The cumulative suite still contains explicit accessibility, owner-only, pagination, payment confirmed/pending/ambiguous, cancellation, durable-recheck, and pre-chain-Paid prevention evidence.

CI must pass on the repository's pinned Windows and Ubuntu Node/npm matrix before this candidate can be considered technically ready for visual review.

## 4. Required visual review widths

The governing M15 specification requires review across the following widths. These widths are review targets, not a requirement to create a unique CSS breakpoint at each value.

| Width | Review intent |
| --- | --- |
| **320 px** | minimum supported mobile width; no essential horizontal scrolling; bottom navigation and forms remain usable |
| **360 px** | existing automated narrow-mobile structural contract |
| **390 px** | contemporary phone width; feed, conversation, profile, wallet, and Pay hierarchy |
| **768 px** | tablet/compact layout; no accidental desktop-only information architecture |
| **1024 px** | compact desktop transition; persistent rail appears without crowding the social column |
| **1440 px** | wide desktop; social content remains readable and does not expand into a dashboard-like full-width canvas |

For each width, inspect at minimum:

- Home;
- Community Posts;
- Community Threads sparse state;
- Conversation;
- Profile;
- Wallet;
- Wall;
- Followers/Following;
- Pay signed out;
- Pay controlled/available only in a safe local fixture or separately authorized environment.

## 5. Scenario matrix

### 5.1 Identity and authority

Review:

- signed out;
- verified signed in with writes disabled;
- controlled social/owner state;
- owner-only Inbox and Settings;
- controlled Pay state only in a non-production fixture unless separately authorized.

The interface must never make disabled authority look merely cosmetic. Unavailable writes must be absent or truthfully disabled.

### 5.2 Content states

Review:

- normal one-post community fixture;
- empty `@fourthst.threads` fixture;
- long post and comment text wrapping;
- flattened nested comments with visually capped indentation;
- pagination continuation;
- profile metadata containing escaped hostile-looking text;
- empty/unavailable/error presentation;
- 404 presentation.

### 5.3 Payment states

Automated tests already bind the payment state machine. Visual inspection must confirm that the UI makes these distinctions obvious without changing their meaning:

- signed-out / verified sign-in required;
- exact invoice review;
- AwaitingSignature;
- BroadcastAccepted / pending;
- ChainConfirmed / Paid;
- ConfirmationTimeout;
- ambiguous/disagreement-style pending state;
- Cancelled before broadcast;
- durable recheck after write mode is disabled.

The invariant remains: **Keychain acceptance is not Paid. Paid requires exact two-node irreversible confirmation. No automatic retry after ambiguity.**

## 6. Keyboard and reduced-motion review

At 390 px and 1024 px, perform a keyboard-only pass through Home, Community, Conversation, Profile, Wallet, and Pay.

Acceptance expectations:

- `Skip to main content` is the first useful bypass;
- focus order follows visual/logical order;
- every interactive control has a visible focus indicator;
- no essential interaction requires hover;
- disabled shell destinations do not become keyboard-activatable fake routes;
- dialogs and disclosure widgets remain understandable with keyboard interaction;
- payment review/cancel/recheck controls are distinguishable;
- reduced-motion preference removes nonessential smooth scrolling/transitions without hiding state changes.

## 7. Visual acceptance rubric

The owner-approved design direction remains:

- 4th Street Bar visually outranks Hive-Bar, and Hive-Bar outranks technology attribution;
- dark charcoal/near-black surfaces, warm off-white text, restrained Bar Gold;
- ordinary social content uses whitespace and separators rather than dashboard cards;
- the venue logo and approved venue photography provide identity;
- Community feels like the digital extension of the physical bar;
- Conversation feels conversational rather than database-like;
- Profile is human-first;
- Wallet is public/read-only first and protocol detail second;
- Pay is merchant-first while preserving exact security and confirmation semantics;
- no unsupported mockup-only capability appears active.

## 8. Local review procedure

A reviewer using the exact candidate should use the repository's pinned runtime and locked dependencies:

```text
node --version      # expected 24.19.0 in accepted CI provenance
npm --version       # expected 11.17.0
npm ci --ignore-scripts --no-fund
npx --no-install patch-package
npm run check
npm start
```

Then review the application in a browser using responsive/device emulation at the widths in Section 4. The normal fixture/test suite must be used for controlled payment-state assertions; do not open a real payment window or request a real Keychain transaction merely to complete visual QA.

## 9. Acceptance decision rule

M15.5 may be accepted only when all of the following are true:

- candidate is a direct descendant of the accepted M15.4 commit;
- exact candidate tree is recorded;
- Git diff contains only declared M15.5 acceptance/test/documentation changes unless a separately reviewed defect fix is necessary;
- pinned Ubuntu CI passes;
- pinned Windows CI passes;
- existing accessibility and 360 px gates pass;
- all M15.2/M15.3/M15.4 regression suites pass;
- manual visual review at 320/360, 390, 768, 1024, and 1440 px records no blocking defect;
- keyboard and reduced-motion review records no blocking defect;
- no production deployment or live payment activity is conflated with UI acceptance.

If a visual or interaction defect is found, M15.5 remains open and the defect must be corrected and revalidated before acceptance.

## 10. Production boundary after M15.5

Even after M15.5 acceptance, deployment remains a separate authorization boundary. Production currently remains whatever exact Privex release was previously accepted; source acceptance alone must not be described as deployment.
