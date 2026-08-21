# Hive-Bar / Fourth Street Bar
## Product Continuity and Cycle 2 Handoff — v0.5.0

**Frozen:** 2026-08-21 10:42 (America/Los_Angeles)  
**Purpose:** canonical post-C2-B handoff checkpoint after C2-B.3 source qualification, exact fast-forward integration, exact-tree production deployment, public read-only verification, and Tester #0 acceptance.  
**Supersedes:** `HIVE_BAR_PRODUCT_CONTINUITY_AND_CYCLE_2_HANDOFF_0_4_1.md` for current-state transfer.  
**Milestone state:** C2-B is ACCEPTED / CLOSED. Remaining presentation observations are deferred polish and are not reasons to reopen C2-B by default.  
**Authority model:** the ordinary ChatGPT lineage remains Project Lead and integration authority. The Work instance remains a bounded specialist. Work output is advisory until accepted by Project Lead + Evan.

---

## 1. Canonical repository and exact accepted production baseline

Repository: `etblink/Hive-Bar`

Canonical `main` was independently re-verified immediately before this freeze:

- commit: `e0d17a8edb8ce893983c68729d195ea2ac419153`
- tree: `4a7cc8800f4bc21c77c6b17097f2c3eada692c2f`
- sole parent: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`
- commit message: `C2-B.3 social action row and Wall/Inbox product framing`

Accepted production identity:

- canonical host: `https://fourthstreetbar.com`
- build: `beta-e0d17a8`
- commit: `e0d17a8edb8ce893983c68729d195ea2ac419153`
- tree: `4a7cc8800f4bc21c77c6b17097f2c3eada692c2f`
- previous accepted release / `last-good`: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`
- accepted beta environment SHA-256: `859c5808e16b1fbe273d21f6258099e127f5d9f072bfc5b82bd5957938c284b2`
- accepted read-only environment SHA-256: `cb8a5895b1d2f06500b5071bc32251b8aa4a3f82f9d138a5806b4c9917ce3868`
- beta manifest: `post, comment, vote, follow, unfollow, subscribe, unsubscribe, profile, claim-rewards, wall, inbox, thread`
- signer mode: browser-side Hive Keychain self-signing
- controlled account count: `0`
- controlled action count: `0`
- payments / Distriator: disabled
- onboarding: inert / disabled
- dormant V1: inactive

Production remains the accepted Privex single-instance deployment behind Cloudflare/Caddy with the app bound to loopback on `127.0.0.1:3000`.

The next instance MUST independently verify current GitHub `main` before source or integration work. Any mismatch is a reconciliation event, not permission to continue from stale state.

---

## 2. Product intent carried forward

The central product principle remains:

> **Strip away a lot of the complexity that comes with interacting on a blockchain.**

Hive supplies identity, social data, rewards, payment primitives and permanence underneath. The patron-facing application should feel like a familiar social/product experience rather than an interface to blockchain machinery.

Fourth Street Bar preserves its own warm black/orange/cream neighborhood-bar identity. Mature social products such as X may be used as **interaction-density references only**, not aesthetic templates.

Blockchain/payment/provenance details must remain exact and available where necessary for review, safety and provenance, but should remain visually subordinate during ordinary social browsing and conversation.

---

## 3. Continuity lineage

### v0.4.0

Represented C2-A complete / accepted / deployed and C2-B architecture audited but not yet implemented.

### v0.4.1

Represented a stable handoff point inside an unfinished C2-B cycle after C2-B.2 production acceptance. It explicitly reserved v0.5.0 for genuine C2-B closure and defined the bounded C2-B.3 presentation follow-up.

### v0.5.0

This freeze records genuine C2-B closure after C2-B.3 source qualification, integration, production acceptance and final Tester #0 review.

**C2-B is now CLOSED.**

Do not create C2-B.4 merely to continue cosmetic refinement. Remaining observations belong in a future consolidated polish/design pass unless a new functional defect is discovered.

---

## 4. C2-B completed scope

C2-B established the focused social-interaction and personal-publishing model while preserving the accepted 12-action beta architecture and all authority/safety boundaries.

### Core C2-B outcomes

- focused native-dialog composition instead of inline form-heavy composition;
- explicit `community|profile` destination for ordinary root posts;
- personal Hive root posts without community injection;
- focused root and nested Reply composition;
- focused Threads composition while preserving the existing exact `thread` protocol/container contract;
- contextual weighted-vote strength dialog before exact-operation review;
- independent Wall and Inbox availability;
- one Wall composer whose privacy choice selects the existing distinct `wall` or `inbox` paths;
- browser-local Hive Keychain encryption preserved for private messages;
- verified-session author/voter/sender derivation preserved;
- origin/CSRF, preflight, duplicate/fingerprint, cancellation and bounded-observation/no-auto-retry protections preserved;
- payment, onboarding, controlled/delegated and dormant-V1 policy boundaries preserved.

### C2-B.1

Accepted predecessor:

- commit: `0a2fbb0c000790cad44e3774e58518c8dcf96f13`
- tree: `a80b1d3b477d290272479dcd3f17938701e2f3f1`
- build: `beta-0a2fbb0`
- PR: `#49`

Established compact orange `+` launchers for Community Posts and owner Profile Posts, focused Threads composition, explicit root-post destination, and the unified Wall public/private composer while keeping distinct operation paths. Public Wall remains 2,000 UTF-8 bytes, private Inbox 1,500 bytes, Threads 500 bytes.

### C2-B.2

Accepted predecessor:

- commit: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`
- tree: `661e185dbe82e125d46ef8d07bcd477230379f39`
- build: `beta-c0d5a43`
- PR: `#50`

Addressed duplicate/exposed nested Reply presentation, root Reply density, social-feed spacing, modal chrome, payout emphasis, coherent Wall public/private context, Wall launcher prominence, post-decryption Inbox control prominence, stale visual-harness assumptions, and a real delayed dialog-focus race.

### C2-B.3

Final accepted C2-B source/production:

- commit: `e0d17a8edb8ce893983c68729d195ea2ac419153`
- tree: `4a7cc8800f4bc21c77c6b17097f2c3eada692c2f`
- parent: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`
- build: `beta-e0d17a8`
- PR: `#51`
- final candidate shape: exactly one direct-child commit / 16 changed files

C2-B.3 established:

- Community `+`, sort select and sort control in one responsive feed toolbar;
- inline social action rows for voting and Share;
- accessible icon-style Share presentation;
- nested Reply visually aligned with vote controls while preserving exact direct-parent targeting;
- more discoverable lightweight root Reply entry;
- established orange `+` launcher on Wall;
- Wall copy/framing that leads more strongly with social/profile meaning and subordinates fee/transaction information;
- Inbox sender/message hierarchy with encrypted/open-message state and subordinate transfer provenance;
- continued suppression of completed decrypt controls once plaintext is shown;
- no expansion of inline-SVG trust merely for presentation icons;
- old safety language preserved in subordinate disclosure where required.

---

## 5. C2-B.3 qualification, integration and production evidence

### Source qualification

Final immutable candidate:

- commit: `e0d17a8edb8ce893983c68729d195ea2ac419153`
- tree: `4a7cc8800f4bc21c77c6b17097f2c3eada692c2f`
- exact parent: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`

Qualification:

- CI #237: PASS
  - Ubuntu deterministic: PASS
  - Windows deterministic: PASS
  - M18.2: PASS
  - M18.3: PASS
  - M18.4: PASS
  - UX-1A: PASS
  - UX-1B: PASS
  - UX-1C: PASS
  - UX-1D: PASS
  - UX-1F: PASS
  - live Hive read-only smoke: expected skip
- UX-1E #93: PASS

The same final tree had also passed the remediation workspace cycle before collapse to the one-commit candidate.

### Integration

C2-B.3 was integrated by exact fast-forward only:

- old `main`: `c0d5a432a340c11fe8ba6b319c0dde99db4cedf0`
- new `main`: `e0d17a8edb8ce893983c68729d195ea2ac419153`
- `force=false`
- no merge commit
- no squash
- no rebase
- GitHub recorded PR #51 merge SHA as the exact candidate itself.

Post-integration qualification:

- CI #238 / run `32504972617`: PASS
- UX-1E #94 / run `32504972658`: PASS

### Exact-tree production deployment

Production deployment accepted:

- build: `beta-e0d17a8`
- commit: `e0d17a8edb8ce893983c68729d195ea2ac419153`
- tree: `4a7cc8800f4bc21c77c6b17097f2c3eada692c2f`

Read-only qualification passed for:

- Community toolbar presentation;
- social action rows;
- Share presentation;
- Reply presentation;
- Wall social framing;
- Inbox framing;
- private-message safety disclosure;
- `m4` operation controller byte identity;
- social action controller byte identity;
- social operation construction byte identity.

The accepted beta environment was restored byte-for-byte after deployment qualification.

No Hive write, Keychain request, payment mutation, onboarding activation, controlled/delegated mutation, DNS/Cloudflare mutation or V1 activation occurred.

Public-edge health/readiness and C2-B.3 presentation assets all passed.

---

## 6. Tester #0 final C2-B result

### Classification

- functionality: PASS
- source qualification: PASS
- integration: PASS
- production deployment: PASS
- public-edge verification: PASS
- Tester #0 product review: PASS WITH DEFERRED POLISH
- C2-B: ACCEPTED / CLOSED

Tester #0 reported that the C2-B.3 surfaces look **significantly better** and that the remaining observations can be handled during later polish.

### Accepted product improvements

- feed toolbar is materially more coherent;
- upvote/downvote/share icon treatment is substantially improved;
- Reply interaction is improved;
- Wall shows good improvement and is moving toward social-first framing;
- Inbox is beginning to feel like an actual inbox;
- overall C2-B interaction model is now mature enough to close without another bounded remediation milestone.

---

## 7. Deferred polish backlog

The following are explicitly carried forward as **deferred polish**, not open C2-B acceptance failures.

### 7.1 Community sort control

The `Apply Sort` button may be unnecessary because selecting a sort option already updates the feed without using the button.

Future polish should verify the actual interaction contract and either:

- remove the redundant Apply Sort control; or
- alter the select behavior so the explicit apply action has a real purpose.

Do not change behavior merely for visual neatness without first confirming the active HTMX/GET interaction.

### 7.2 Unified metadata + action row

Current upvote/downvote/share icons are improved but still sit below counts/reply count/payout.

Future polish should explore one mature inline social row combining relevant metadata and controls, for example:

- upvote count + upvote action;
- downvote count + downvote action where applicable;
- reply count;
- payout;
- Share action.

The exact vote, reply, payout and Share semantics must remain unchanged.

### 7.3 Root Reply launcher consistency

For design consistency, replace textual `Post your reply` with the established orange `+` launcher.

The `+` launcher should sit inline with `Replies (N)` rather than occupy a separate full-width row.

This is presentation polish only. Preserve exact parent targeting and focused-dialog behavior.

### 7.4 Nested reply/action alignment

Nested comments should ultimately use the same integrated metadata/action-row treatment so upvote/downvote/Reply and their relevant counts do not feel vertically separated.

### 7.5 Wall — show, do not tell

The Wall is substantially improved but still contains more explanatory copy than desired.

Future polish should communicate the Wall’s value primarily through structure and behavior:

- profile reputation/following establishes valuable profile real estate;
- the Wall is visibly a public social surface;
- the orange `+` establishes the act of contributing;
- fee/payment information remains exact but recedes until it is decision-relevant;
- exact payment review remains mandatory before Keychain approval.

Do not hide or weaken material fee/privacy disclosures; improve hierarchy instead.

### 7.6 Inbox polish

The Inbox now begins to read as an inbox and is accepted for C2-B closure.

Later polish may improve familiar messaging affordances, density, read/open state, sender hierarchy and message organization while preserving:

- browser-local Memo decryption;
- no decrypted plaintext sent back to Hive-Bar;
- encrypted-at-rest/on-Hive message behavior;
- transfer/payment provenance availability;
- exact private-message safety disclosure.

### Deferred-polish rule

**Do not reopen C2-B solely for these items.**

Group them into a future design/polish milestone unless a genuine functional, authority, privacy, accessibility or transaction-safety defect emerges.

---

## 8. Frozen operation and safety boundaries

Unless separately changed by Evan:

- production beta surface remains the exact 12-action manifest;
- verified-session identity derivation remains authoritative for author/voter/sender;
- origin/CSRF protections remain;
- preflight ownership/revision checks remain;
- exact-operation construction/review remains;
- duplicate/fingerprint protections remain;
- cancellation remains explicit;
- ambiguous broadcast/observation outcomes are never automatically retried;
- browser-side Hive Keychain remains the signer;
- the production VPS stores no private Hive signing key;
- Inbox/private-message encryption remains browser-local;
- decrypted Inbox plaintext is not sent back to Hive-Bar;
- Wall and Inbox remain distinct operation paths;
- public Wall max remains 2,000 UTF-8 bytes;
- private Inbox max remains 1,500 bytes;
- Threads retain the existing `thread` protocol/container and 500-byte limit;
- payments / Distriator remain disabled unless separately redesigned, qualified and authorized;
- onboarding remains production-inert until durable state/restart recovery and governance prerequisites are satisfied;
- controlled/delegated lanes remain inert unless separately authorized;
- dormant V1 remains inactive;
- no DNS/Cloudflare mutation is implied by UX/polish work.

---

## 9. Feature-availability state carried forward

Ordinary personal Hive root posting is now implemented and accepted:

- explicit `community|profile` destination exists;
- omitted destination preserves prior community behavior;
- profile destination creates a personal root post without community injection.

Still carried forward:

- normal image upload/attachment remains missing even though safe HTTPS Markdown image rendering exists;
- onboarding retains a concrete blocker because request state is process-local/in-memory and lost on restart, plus creator/recovery/token/HP/legal/operational governance requirements;
- general Pay remains outside ordinary patron beta activation;
- payments/Distriator must not be blindly activated;
- site-wide prose/copy cleanup remains a later consolidated pass.

---

## 10. Work-instance policy

Work remains a bounded specialist and does not own product authority, milestone sequencing, acceptance, deployment, gate activation or interpretation of Tester #0 feedback.

Work Prompt #1 is complete and must not be repeated merely because a new ordinary instance starts fresh.

Work Prompt #2 remains reserved. Do not spend it automatically. Media-pipeline architecture remains a strong candidate unless later evidence identifies a higher-value Work-scale use.

---

## 11. Production deployment discipline

For future exact-tree deployments:

1. independently bind GitHub `main` to the authorized exact commit/tree;
2. require exact post-integration CI evidence where applicable;
3. verify current accepted beta production identity before mutation;
4. preserve accepted beta environment byte-for-byte;
5. temporarily enter the accepted read-only environment;
6. deploy the authorized exact commit exactly once;
7. verify exact commit/tree/build and served assets while writes are disabled;
8. restore accepted beta environment byte-for-byte;
9. verify beta manifest and inert boundaries;
10. perform public read-only verification;
11. never automatically retry an ambiguous deployment or external mutation.

Current accepted production already passed this procedure for `e0d17a8...`. Do NOT redeploy it merely because a successor instance starts fresh.

---

## 12. Handoff instructions for the next Project Lead instance

At intake:

1. Read this v0.5.0 continuity object first.
2. Independently verify GitHub `main`.
3. Expected source:
   - commit `e0d17a8edb8ce893983c68729d195ea2ac419153`
   - tree `4a7cc8800f4bc21c77c6b17097f2c3eada692c2f`
4. Expected production:
   - build `beta-e0d17a8`
   - same commit/tree
   - beta environment SHA `859c5808e...284b2`
5. Treat C2-B as ACCEPTED / CLOSED.
6. Do not create C2-B.4 merely to continue the deferred cosmetic work in section 7.
7. Preserve the accepted C2-B interaction model and operation boundaries.
8. Carry the section 7 observations into the next appropriate consolidated polish/design milestone.
9. Do not repeat C2-B.1/B.2/B.3 deployment or live-operation testing without a new reason and explicit authorization.
10. Keep Work Prompt #2 reserved unless its use is explicitly justified and authorized.
11. Any source write, integration, production deployment, live Hive write, Keychain approval, payment mutation, onboarding activation, DNS/Cloudflare mutation, controlled/delegated mutation or V1 activation requires the appropriate explicit authorization boundary.
12. Before defining the next major implementation milestone, determine whether the highest-value next move is functional capability, media pipeline, onboarding durability, or a consolidated polish pass; do not assume polish is automatically next merely because it is documented here.

---

## 13. Freeze statement

This document freezes a **stable post-C2-B production and handoff state**.

The project is not waiting on C2-B remediation:

- exact source is green;
- exact integration is complete;
- exact production deployment is accepted;
- public-edge qualification is green;
- functionality is working;
- authority/privacy/payment boundaries remain intact;
- Tester #0 accepted the interaction model and explicitly deferred remaining visual observations to later polish.

Therefore:

**v0.5.0 = HANDOFF-SAFE / PRODUCTION-STABLE / C2-B ACCEPTED AND CLOSED / DEFERRED POLISH RECORDED**

Do not reopen C2-B by implication.