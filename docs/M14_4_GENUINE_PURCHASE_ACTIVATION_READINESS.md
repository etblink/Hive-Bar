# M14.4 — Genuine-purchase activation readiness

Status: source candidate only. This milestone does not authorize installation on Privex, a production payment window, a Keychain request, a Hive transfer, a genuine or synthetic purchase, a retry, a V4V invoice generation solely for testing, or any Distriator claim/activation.

## Accepted baseline

M14.4 is rooted at the M14.3-accepted production source:

- commit `78847ce3b1e0a26aa6fe60940d9ef5658eb384af`
- tree `e6deb50f3a69588567907dc0001d5d4c9d8a52a6`
- canonical host `fourthstreetbar.com`
- payer `@etblink`
- merchant `@fourthstreetbar`
- maximum `1.000 HBD`
- authority `Active`
- signer `Hive Keychain`
- durable receipt store `/var/lib/hive-bar/payments/receipts.sqlite3`
- `DISTRIATOR_ENABLED=false`

M14.3 proved the payment profile in an isolated private-network systemd namespace while leaving the public service read-only. M14.4 preserves that standing state.

## Fresh external-service revalidation — 2026-08-15

The public V4V application currently presents Hive/HBD receiving as a QR/POS workflow in addition to its Lightning functionality. The public application identified itself as v2.7.2 during this review. This supports continuing to consume a fresh V4V-generated Hive payment URI rather than constructing one in Hive-Bar.

Distriator's current public customer instructions state that an HBD purchase may be made with Keychain or V4V and that the customer should open Distriator within 30 minutes of purchase. A newer Distriator announcement also describes a more curated cashback process involving business verification and administrative review. These external behaviors are not frozen dependencies of Hive-Bar.

Therefore the first genuine-payment acceptance criterion remains **payment only**. Cashback eligibility, percentage, review requirements, timing, approval, and payout are explicitly outside M14.4 and outside the first genuine-purchase pass/fail decision. `DISTRIATOR_ENABLED=false` remains mandatory.

## Existing payment semantics retained unchanged

M14.4 does not alter the Pay Tab protocol. The accepted application already:

1. requires a verified payer session, same-origin request, CSRF token, controlled `payment` action, payer allowlist, and merchant binding;
2. decodes a `hive://` payment URI and rejects Lightning invoices;
3. accepts exactly one `transfer` operation;
4. resolves only V4V's exact empty sender placeholder to the already verified payer;
5. requires canonical positive HBD no greater than `1.000 HBD`, merchant exactly `fourthstreetbar`, and a non-empty memo;
6. computes an operation fingerprint and shows the immutable exact operation before Keychain;
7. treats Keychain acceptance only as `BroadcastAccepted`; and
8. marks **Paid** only after exact independent-node observation and irreversible settlement.

M14.4 adds a second fail-closed Privex read-only profile for **durable receipt observation**. The existing inert profile with `:memory:` remains valid before any purchase. After a controlled payment window, the disable path returns `HIVE_WRITE_MODE=disabled` and `HIVE_SIGNER_MODE=disabled` while retaining the exact durable receipt database path. Payment preparation remains disabled, but a previously stored receipt can still be loaded and its Hive transaction can be re-observed. Because receipt access accepts the same verified account even after the in-memory session identifier changes, a pending receipt can be reconciled after a service restart without reopening payment authorization. No second payment is implied or authorized by that restoration.

## New M14.4 preparation record

`scripts/m14-freeze-genuine-purchase.js` creates a deterministic, no-network JSON preparation record from a **fresh genuine-purchase V4V Hive/HBD URI**. It binds:

- accepted full commit and tree;
- SHA-256 of the exact trimmed invoice URI;
- payer and merchant;
- amount and memo;
- exact canonical operation JSON;
- Active authority;
- operation fingerprint;
- a SHA-256 binding over the canonical record;
- `DISTRIATOR_ENABLED=false`; and
- explicit `false` values for Keychain request, broadcast, and retry authorization.

The record status is `PREPARED_NO_KEYCHAIN_AUTHORIZATION`. Creating or verifying this record cannot open Keychain or broadcast a Hive operation.

The record is not itself an authorization. A future operator must preserve the exact file SHA-256 and separately review its operation fingerprint and operation JSON before a payment window can even be opened.

## Bounded Privex payment window

`ops/privex/bin/hive-bar-payment-window-enable` is a future-installation helper. It is intentionally unusable until a protected frozen-record file has been installed under `/etc/hive-bar/payment-authorizations` and its exact SHA-256 is supplied.

Before activation it requires:

- root execution and Node v24.19.0;
- the current installed release identity records;
- a protected `root:root:0600` frozen record directly under the protected authorization directory;
- a previously unused frozen-record digest;
- healthy public `writeMode=disabled` and loopback-only binding;
- the exact read-only release gate;
- the exact inactive M14 payment gate;
- matching protected session-secret bytes between read-only and payment profiles; and
- exact frozen-record commit/tree verification against the currently installed release.

Before changing the active environment it writes a durable consumed marker, creates an exact byte backup of the read-only environment, and successfully schedules a mandatory 15-minute automatic restoration. A frozen record is one-shot even if activation subsequently fails; ambiguity never authorizes reuse.

The standing healthcheck timer intentionally accepts only `writeMode=disabled`. M14.4 does not weaken it. Instead, after the mandatory auto-disable timer is armed and before the profile swap, the helper suspends that read-only-only timer for the bounded payment window. It is restored by every successful disable/rollback path.

A successful window exposes only the already accepted payment route with payer `etblink`, merchant `fourthstreetbar`, action exactly `payment`, Active authority through Keychain, ceiling `1.000 HBD`, durable receipts, and Distriator disabled. Opening the window still performs **no Keychain request and no Hive write**. It stops at a new explicit authorization boundary.

## Exact read-only restoration

`ops/privex/bin/hive-bar-payment-window-disable` uses the exact saved inert read-only environment as its protected baseline, derives only the bounded durable-observation changes, validates that derived environment through the Privex read-only release gate, atomically installs it, restarts the service, requires `writeMode=disabled`, requires the listener to remain loopback-only, and restarts the standard healthcheck timer. The derived profile fixes the receipt database to `/var/lib/hive-bar/payments/receipts.sqlite3`, disables Keychain signing and all controlled accounts/actions, keeps Distriator false, and clears M9/M10/M12 control state.

The Privex read-only gate is extended narrowly: it continues to accept the historical inert `:memory:` profile, and additionally accepts the exact durable receipt path only when payment preparation is disabled, signer mode is disabled, merchant/ceiling remain bound, and no Posting-control state exists. Other receipt paths remain refused.

The disable path refuses to guess. If active production is not read-only and the exact saved baseline is missing, it exits critical rather than synthesizing a configuration. Automatic timeout mode must also match the exact active frozen-record digest.

The durable consumed marker is not removed by read-only restoration. Reopening the same frozen record is forbidden.

## Genuine-purchase sequence after M14.4 acceptance

No step below should be performed merely to complete a milestone. Begin only when a real bar purchase independently exists.

1. At the point of sale, generate a **fresh current V4V Hive/HBD receive invoice** for the genuine sale. Do not use Lightning mode and do not manually edit the URI.
2. Preserve the exact invoice URI in a protected local file and run the M14.4 freeze tool against the then-accepted commit/tree and payer `etblink`.
3. Review the resulting payer, merchant, amount, memo, exact operation JSON, operation fingerprint, binding digest, and file SHA-256. The record must still state that Keychain/broadcast/retry are unauthorized.
4. Under a separate server-staging authorization, install the accepted M14.4 helpers and protected frozen record, then open the bounded payment window by exact record SHA-256. Opening the window still does not authorize Keychain.
5. Report the live window markers and exact frozen operation back to the product owner. Obtain a **new, explicit authorization for exactly one Active Keychain request for exactly that operation fingerprint**.
6. Only then may the browser advance past immutable review and make one Keychain request. No retry follows cancellation, failure, missing transaction ID, timeout, disagreement, or ambiguous outcome.
7. If Keychain accepts, preserve the transaction ID when returned and keep the receipt pending until exact independent-node irreversible confirmation. The controlled payment window may be closed immediately after broadcast acceptance because M14.4's durable read-only observation profile can continue chain rechecks without payment authorization; in all cases automatic restoration is the 15-minute fail-safe ceiling.
8. Reconcile the durable Hive-Bar receipt with the merchant V4V/POS record from the durable read-only observation profile. A pending or ambiguous transaction must be reconciled before any new payment is considered.
9. Distriator remains a separate future decision. The initial genuine purchase neither enables nor proves eligibility for cashback.

## M14.4 acceptance evidence

M14.4 source acceptance requires:

- candidate rooted exactly at the accepted M14.3 commit/tree;
- no changes to existing payment semantics unless separately identified and reviewed;
- deterministic freeze/verification tests;
- fail-closed tests for commit/tree drift, authorization escalation, transfer/fingerprint/binding tampering, amount ceiling, bounded auto-disable ordering, the narrowly bounded durable read-only receipt profile, and healthcheck-timer restoration;
- zero-warning lint, production build, full tests, secret scan, and high-severity production dependency audit on Ubuntu and Windows under Node 24.19.0/npm 11.17.0;
- no production installation or activation required for source acceptance; and
- no Hive write, Keychain request, genuine purchase, synthetic purchase, or Distriator action.

A later separately authorized production-staging step may install the accepted helpers and prepare a particular genuine purchase. The Keychain request remains a distinct authorization after exact fingerprint review.
