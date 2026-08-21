# Hive-Bar / Fourth Street Bar
## Product Continuity and Cycle 2 Handoff — v0.4.1

**Frozen:** 2026-08-21 05:10 (America/Los_Angeles)  
**Purpose:** handoff-safe canonical continuity checkpoint after C2-B.2 production acceptance and the subsequent Tester #0 presentation review.  
**Supersedes:** `HIVE_BAR_PRODUCT_CONTINUITY_AND_CYCLE_2_HANDOFF_0_4_0.md` for current-state transfer.  
**Does not mean:** C2-B is closed. C2-B remains open for a bounded presentation follow-up.  
**Authority model:** the ordinary ChatGPT lineage is Project Lead and integration authority. The Work instance remains a bounded specialist. Work output is advisory until accepted by Project Lead + Evan.

---

## 1. Canonical repository and exact production baseline

Repository: `etblink/Hive-Bar`

Canonical `main` was independently re-verified at this freeze:

- commit: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`
- tree: `661e185dbe82e125d46ef8d07bcd477230379f39`
- sole parent: `0a2fbb0c000790cad44e3774e58518c8dcf96f13`
- commit message: `C2-B.2 social surface density and composer presentation`

Accepted production identity:

- canonical host: `https://fourthstreetbar.com`
- build: `beta-c0d5a43`
- commit/tree match canonical `main`
- previous accepted release / `last-good`: `0a2fbb0c000790cad44e3774e58518c8dcf96f13`
- accepted beta environment SHA-256: `859c5808e16b1fbe273d21f6258099e127f5d9f072bfc5b82bd5957938c284b2`
- accepted read-only environment SHA-256: `cb8a5895b1d2f06500b5071bc32251b8aa4a3f82f9d138a5806b4c9917ce3868`
- beta manifest: `post, comment, vote, follow, unfollow, subscribe, unsubscribe, profile, claim-rewards, wall, inbox, thread`
- signer mode: browser-side Hive Keychain self-signing
- controlled account/action counts: `0 / 0`
- payments / Distriator: disabled
- onboarding: inert / disabled
- dormant V1: inactive

Production remains the accepted Privex single-instance deployment behind Cloudflare/Caddy, with the app bound to loopback on `127.0.0.1:3000`.

The next instance MUST independently verify current GitHub `main` before source or integration work. A mismatch is a reconciliation event, not permission to continue from stale state.

---

## 2. Product intent carried forward

The central principle remains:

> **Strip away a lot of the complexity that comes with interacting on a blockchain.**

Hive supplies identity, social data, rewards, payments and permanence underneath. The patron-facing application should feel like a familiar social/product experience rather than an interface to blockchain machinery.

Fourth Street Bar keeps its own warm black/orange/cream neighborhood-bar identity. Mature social products such as X may be used as **interaction-density references only**, not as aesthetic templates. Blockchain/payment/provenance details must remain exact and available where necessary, but visually subordinate during normal social browsing and conversation.

---

## 3. Continuity lineage

The previous canonical freeze was `HIVE_BAR_PRODUCT_CONTINUITY_AND_CYCLE_2_HANDOFF_0_4_0.md`.

v0.4.0 represented C2-A complete/accepted/deployed, its Tester #0 profile-settings preservation follow-up closed, and C2-B architecture audit complete but implementation not yet authorized.

v0.4.1 advances continuity through C2-B implementation, C2-B.1 integration/production acceptance, C2-B.2 presentation remediation/integration/production acceptance, and current Tester #0 findings showing meaningful improvement but remaining social-surface presentation debt.

**v0.5.0 is deliberately NOT frozen here.** Reserve v0.5.0 for genuine C2-B closure after the outstanding presentation findings are resolved and accepted.

---

## 4. C2-B implementation state

C2-B established focused social interaction and personal publishing while preserving the 12-action beta architecture, verified-session identity derivation, origin/CSRF, preflight, duplicate/fingerprint, cancellation, exact-operation review, bounded observation/no-auto-retry, Keychain authority, payment/onboarding/controlled-delegated boundaries and dormant V1.

### C2-B.1

Accepted predecessor:

- commit: `0a2fbb0c000790cad44e3774e58518c8dcf96f13`
- tree: `a80b1d3b477d290272479dcd3f17938701e2f3f1`
- build: `beta-0a2fbb0`
- PR: `#49`
- parent: `69abeb3cf7aba590b756629c5861e3bddf5306d1`

C2-B.1 established compact orange `+` launchers for Community Posts and owner Profile Posts, focused Threads composition, explicit `community|profile` root-post destination, personal root posts without community injection, and one Wall composer whose privacy toggle selects the existing distinct `wall` or `inbox` path. Public Wall remains 2,000 UTF-8 bytes, private Inbox 1,500 bytes, Threads 500 bytes.

### C2-B.2

Current accepted source/production:

- commit: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`
- tree: `661e185dbe82e125d46ef8d07bcd477230379f39`
- parent: `0a2fbb0c000790cad44e3774e58518c8dcf96f13`
- build: `beta-c0d5a43`
- PR: `#50`
- shape: exactly one commit / 12 scoped files

C2-B.2 addressed duplicate/exposed nested Reply presentation, root Reply density, social-feed spacing, modal chrome, payout emphasis, Wall public/private context, Wall launcher prominence, post-decryption Inbox control prominence, stale visual-harness assumptions, and a real delayed dialog-focus race. Initial dialog focus is now synchronous and regression-tested not to steal later patron focus.

Qualification:

- CI #232 / run `32475701015`: SUCCESS, including Windows + Ubuntu deterministic, M18.2/M18.3/M18.4 and UX-1A/B/C/D/F; live Hive read-only smoke expected skip
- UX-1E #88 / run `32475700988`: SUCCESS
- post-integration CI #233 / run `32476686970`: PASS
- post-integration UX-1E #89 / run `32476686862`: PASS

Integration was a direct fast-forward with `force=false`; no merge commit, squash or rebase. Exact-tree production deployment and public-edge qualification passed. The accepted beta environment was restored byte-for-byte. No Hive write, Keychain request, payment mutation, onboarding activation, controlled/delegated mutation, DNS/Cloudflare mutation or V1 activation occurred.

---

## 5. Tester #0 after C2-B.2 production

### Classification

- functionality: PASS
- source qualification: PASS
- integration: PASS
- production deployment: PASS
- public-edge verification: PASS
- presentation: materially improved but NOT YET ACCEPTED
- C2-B: OPEN

Tester #0 reports that the application feels **significantly less form-heavy** and general spacing/density looks fine. Transaction machinery is still more visually present than desired.

### Community Posts / Threads

Accepted:
- content column looks fine;
- orange `+` launcher looks and feels fine;
- composer looks fine for now.

Open:
- put `Sort posts` select/apply controls on the same horizontal toolbar row as the orange `+` on desktop;
- replace the large textual Share button with an icon treatment;
- keep upvote/downvote actions inline rather than below post metadata.

### Root Reply

`Post your reply` is too quiet and took a moment to discover. Preserve the lightweight non-form treatment, but make it clearly interactive without reverting to a large primary button. The dialog is acceptable for now.

### Nested Reply

The old duplicate/exposed Reply residue is resolved. The quiet `Reply` affordance is conceptually correct, but should sit inline with upvote/downvote actions rather than on a separate row.

### Wall

This is the most important remaining product-framing issue.

Tester #0 interpretation:

> A person who has a following and a good reputation has higher-value real estate on their profile. If you want to post on their Wall, you can send them a Wall post, for a fee.

Therefore:
- use the same orange `+` launcher instead of textual `Write a message`;
- make Wall feel like a social/profile affordance first;
- keep the fee exact and visible at the correct review/payment stage, but reduce transaction-first framing during browsing/composition;
- preserve the accepted coherent `WALL MESSAGE` / `PRIVATE MESSAGE` context switch.

### Inbox

Post-decryption presentation is better: the completed decrypt button disappears and plaintext leads. However, the surface still does **not feel like an inbox**. Future work should establish recognizable sender/message/time/status hierarchy while retaining browser-local Keychain Memo decryption, never sending plaintext back to Hive-Bar, and keeping transfer provenance available but subordinate.

### Overall

Accepted: less form-heavy, spacing/density generally fine, focused dialogs acceptable for now, orange `+` pattern works, Wall public/private context is clear, decrypted Inbox state improved.

Open: action-row coherence, Share icon treatment, root Reply discoverability, Wall social/value framing, Inbox framing, and further visual subordination of blockchain/payment machinery.

---

## 6. Recommended next bounded step — C2-B.3

Do NOT reopen C2-B broadly.

**C2-B.3 — Social Action Row + Wall/Inbox Product Framing**

Recommended scope:

1. Community toolbar: align orange `+`, sort select and sort-apply interaction in one coherent desktop row; preserve responsive stacking.
2. Unified social action rows:
   - post: inline upvote / downvote / Share icon;
   - nested comment: inline upvote / downvote / Reply;
   - preserve exact existing vote/reply/share behavior and review semantics.
3. Root Reply: retain lightweight presentation but improve interaction discoverability.
4. Wall:
   - use the established orange `+` launcher;
   - preserve one composer and distinct `wall` / `inbox` operation selection;
   - reduce fee/transaction prominence before exact review;
   - retain exact fee/payment disclosure where authorization requires it;
   - preserve the reputation/following -> valuable profile real-estate product concept.
5. Inbox:
   - create recognizable inbox/message hierarchy;
   - preserve browser-local Keychain decryption and plaintext privacy;
   - subordinate transfer provenance without removing it.
6. Qualification: deterministic regressions plus focused visual acceptance; preserve cumulative M18/UX gates unless a separately justified harness migration is necessary.

**This continuity document does not itself authorize C2-B.3 implementation.**

---

## 7. Frozen operation / safety boundaries

Unless separately changed by Evan:

- accepted production beta surface remains the 12-action manifest;
- verified-session identity derivation remains authoritative for author/voter/sender;
- origin/CSRF, preflight ownership/revision, exact-operation review, duplicate/fingerprint, cancellation and bounded-observation/no-auto-retry protections remain;
- browser-side Hive Keychain remains signer; no private Hive signing key is stored on the VPS;
- Inbox encryption remains browser-local and decrypted plaintext is not sent back to Hive-Bar;
- Wall and Inbox remain distinct operation paths;
- public Wall max remains 2,000 UTF-8 bytes;
- private Inbox max remains 1,500 bytes;
- Threads remain on the existing `thread` protocol/container with 500-byte limit;
- payments/Distriator remain disabled unless separately redesigned, qualified and authorized;
- onboarding remains production-inert until durable state/restart recovery and governance prerequisites are satisfied;
- controlled/delegated lanes remain inert unless separately authorized;
- dormant V1 remains inactive;
- no DNS/Cloudflare mutation is implied by UX work.

---

## 8. Feature-availability updates relative to v0.4.0

The v0.4.0 audit conclusion that ordinary personal Hive root posting was missing is superseded by C2-B. Root posting now supports explicit `community|profile` destination, omitted destination preserves prior community behavior, and profile destination creates a personal root post without community injection.

Carried-forward conclusions:

- normal image upload/attachment remains missing even though safe HTTPS Markdown image rendering exists;
- onboarding retains a concrete blocker because request state is process-local/in-memory and lost on restart, plus creator/recovery/token/HP/legal/operational governance requirements;
- general Pay remains outside ordinary patron beta activation;
- payments/Distriator must not be blindly activated;
- site-wide prose/copy cleanup remains a later pass and should not be mixed into bounded remediation.

---

## 9. Work-instance policy

Work remains a bounded specialist and does not own product authority, sequencing, acceptance, deployment, gate activation or interpretation of Tester #0 feedback.

Work Prompt #1 is complete and must not be repeated merely because a new ordinary instance starts fresh.

Work Prompt #2 remains reserved. Do not spend it automatically. Media-pipeline architecture remains a strong candidate unless later evidence identifies a higher-value Work-scale use.

---

## 10. Production deployment discipline

For future exact-tree deployments:

1. independently bind GitHub `main` to the authorized exact commit/tree;
2. require exact post-integration CI evidence where applicable;
3. verify current accepted beta production identity before mutation;
4. preserve accepted beta environment byte-for-byte;
5. temporarily enter the accepted read-only environment;
6. deploy the authorized exact commit exactly once;
7. verify exact commit/tree/build and served assets while writes are disabled;
8. restore accepted beta environment byte-for-byte;
9. verify beta manifest / inert boundaries;
10. perform public read-only verification;
11. never automatically retry an ambiguous deployment or external mutation.

The current accepted production already passed this procedure for `c0d5a432...`. Do NOT redeploy merely because a successor instance starts fresh.

---

## 11. Handoff instructions

At intake:

1. Read this v0.4.1 continuity object first.
2. Independently verify GitHub `main`.
3. Expected source: commit `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`, tree `661e185dbe82e125d46ef8d07bcd477230379f39`.
4. Expected production: build `beta-c0d5a43`, same commit/tree, beta environment SHA `859c5808e...284b2`.
5. Do not repeat C2-B.1/C2-B.2 deployment or live-operation testing without a new reason and authorization.
6. Do not classify C2-B as closed.
7. Next product question is bounded C2-B.3 in section 6.
8. Preserve what Tester #0 accepted: content-column density, orange `+` pattern, focused dialogs for now, coherent Wall public/private context, and post-decryption Inbox control demotion.
9. Resolve the open findings rather than restarting the design system.
10. Freeze v0.5.0 only after C2-B is actually closed and accepted.
11. Keep Work Prompt #2 reserved unless explicitly justified and authorized.
12. Source writes, integration, deployment, live Hive write, Keychain approval, payment mutation, onboarding activation, DNS/Cloudflare mutation, controlled/delegated mutation or V1 activation require the appropriate explicit authorization boundary.

---

## 12. Freeze statement

This document intentionally freezes a **stable handoff point inside an unfinished C2-B cycle**.

The project is not in a failure state: exact source is green, production is green, functionality is working, security/authority boundaries remain intact, and Tester #0 reports a significant reduction in form-heavy presentation.

Remaining work is product presentation refinement: action-row coherence, root Reply discoverability, Wall social/value framing, Inbox recognizable messaging framing, and further visual subordination of transaction machinery.

**v0.4.1 = HANDOFF-SAFE / PRODUCTION-STABLE / C2-B OPEN FOR PRESENTATION FOLLOW-UP**

Do not promote this checkpoint to C2-B closure by implication.
