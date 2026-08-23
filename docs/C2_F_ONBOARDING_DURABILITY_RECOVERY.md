# C2-F / C2-F.1 — Onboarding Durability, Recovery, and Policy Configuration

## Candidate boundary

C2-F hardens the dormant M19.3 in-person onboarding lane without activating it. C2-F.1 adds bounded merchant policy configuration without changing the custody, broadcast, or durable recovery architecture. The combined candidate preserves browser-local customer key custody, exact public-key-only server intake, creator Active-authority Keychain signing, exact `create_claimed_account` + `delegate_vesting_shares` operations, and no automatic retry after the Keychain gate.

Production onboarding remains disabled until a separate activation authorization.

## Durable state

The onboarding store is SQLite schema version 1 using defensive mode when available, foreign keys, a 5-second busy timeout, WAL and FULL synchronous mode for disk files, STRICT tables, append-only lifecycle events, non-symlink path checks, and production require-existing semantics.

Atomic constraints provide:

- one live request per Hive username;
- one prepared/signing/observing transaction lane per creator;
- payload-bound durable idempotency;
- immutable prepared operation/fingerprint/authority/delegation data;
- immutable recorded transaction identity;
- configured live and rolling-24-hour request ceilings.

Only `pending` and `prepared` requests expire. `signing` and `observing` survive TTL and restart so uncertainty cannot become a fresh attempt.

## Customer recovery boundary

Customer secrets exist only in browser memory and the user-created recovery download. The server request body contains the four STM public keys, never the master password or WIFs. After QR creation, the Blob URL is revoked, download attributes are removed, the secret panel is hidden/cleared, and the in-memory credential reference is released.

Session storage contains only an opaque recovery capability plus safe routing metadata. It does not contain secret credentials or public keys. The opaque idempotency capability can recover the same safe request status after an ambiguous HTTP result or reload.

## Merchant policy configuration

C2-F.1 establishes the following beta defaults while keeping them explicit configuration rather than hard-coded venue economics:

- `HIVE_ONBOARDING_CASH_FEE_USD=5.00` — merchant-configurable positive USD cash fee using exactly two decimals;
- `HIVE_ONBOARDING_STARTER_HP=5.000` — merchant-configurable positive starter delegation;
- `HIVE_ONBOARDING_MIN_REMAINING_HP=10.000` — merchant-configurable remaining-HP reserve with a Hive-Bar hard floor of **10.000 HP**;
- `HIVE_ONBOARDING_LOW_ACT_THRESHOLD=3` — merchant-configurable low claimed-account-token warning threshold;
- request rate/live/daily limits remain configurable, with beta defaults of 5 requests per 60 seconds per client, 25 live requests, and 50 requests per rolling 24 hours.

The request-limit parser intentionally permits substantially larger validated values than the beta defaults so those defaults are not structural scaling ceilings.

For the 4th Street Bar production profile, the accepted creator policy is `@fourthstreetbar`. The repository production environment example records that choice while keeping `HIVE_ONBOARDING_ENABLED=false`.

## Creator resource policy

Before staff may confirm the in-person fee, readiness checks:

1. requested username remains available;
2. configured creator exists;
3. at least one claimed-account token (ACT) exists;
4. the exact starter delegation can be funded **and** the creator will retain at least the configured remaining-HP reserve after that delegation.

The reserve is converted from the configured HP amount using current Hive vesting properties. The hard platform floor is 10.000 HP; a merchant may raise the configured reserve but cannot lower it below that floor.

ACT inventory is classified as:

- **normal** at or above the configured warning threshold;
- **low** when at least one token remains but inventory is below the configured threshold;
- **blocked** at zero.

Low inventory is a visible authenticated staff warning but does not consume or invalidate an otherwise safe request. Zero ACT remains a hard stop. Token replenishment is an explicit merchant/operator responsibility; Hive-Bar does not automatically claim accounts.

The same ACT and post-delegation HP reserve constraints are revalidated at the one-time broadcast gate immediately before Keychain opens.

## Staff recovery boundary

Protected staff routes require verified session, exact Origin, CSRF, and the exact configured creator. Staff can refresh a prepared request and continue to its one Keychain gate. Once the durable state is `signing` or `observing`, the UI is observation-only and never reconstructs a second broadcast action.

A definite pre-broadcast or definite failed outcome is operationally distinct from an ambiguous Keychain outcome. Ambiguous post-gate outcomes remain observation-only until chain state resolves; they must not be treated as a retryable failure.

## Fail-closed and rollback behavior

If onboarding is enabled but its durable store cannot be opened or qualified, onboarding returns unavailable while unrelated application routes continue serving. Readiness reports not-ready. New onboarding work cannot start.

If an operator later disables onboarding while a request is already in `signing`/`observing`, the durable request remains observable/resolvable; disabling the feature must not destroy the evidence required to avoid retrying an uncertain transaction.

## Operational policy recorded but not activated

The accepted business policy for later activation is:

- production creator: `@fourthstreetbar`;
- merchant controls creator Active authority; ordinary staff Posting authority does not by itself authorize onboarding;
- fee and starter HP are merchant-configurable;
- definite account-creation failure requires immediate refund under the venue SOP;
- 10.000 HP is the Hive-Bar minimum post-delegation reserve, with venue-configurable higher reserve;
- ACT replenishment is merchant/operator responsibility, with low inventory warning below the configured threshold;
- current request ceilings are beta defaults and should be revisited for venue scale rather than treated as architectural limits.

These statements define later operating policy. They do **not** authorize production environment changes, onboarding activation, cash collection, Keychain signing, ACT consumption, account creation, or HP delegation.

## Activation boundary

A later activation bundle should separately authorize: integration; provisioning the durable database; installing the writable-path drop-in; setting explicit onboarding environment values; qualifying exact store ownership/mode/schema; deploying and verifying the disabled runtime; defining backup/restore and operator SOP; and then, only with separate human authorization, performing genuine in-person account creation.

No C2-F/C2-F.1 source-qualification step performs any of those live actions.
