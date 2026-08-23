# M19.3 — In-person Hive onboarding

M19.3 is the historical onboarding interaction and security boundary. C2-F hardens its request lifecycle for durable restart recovery, and C2-F.1 adds bounded merchant policy configuration. Neither milestone activates onboarding in production.

## Customer custody

The customer browser creates the Hive master password and derives owner, Active, Posting, and Memo private keys locally through the pinned same-origin `hive-tx` browser module graph. Hive-Bar receives only the corresponding STM public keys. The server never receives, logs, stores, or reconstructs the master password or any WIF.

The customer must save the recovery file before creating the bartender QR. The download capability is temporary: after successful QR handoff the object URL is revoked, the link is removed/hidden, the secret recovery DOM is cleared, and the browser-held credential object is released. Reload recovery stores only an opaque idempotency/request pointer in `sessionStorage`; it never stores the master password, WIFs, public keys, or recovery-file body.

## Durable request lifecycle

C2-F uses a versioned SQLite store for onboarding request state. The live states are `pending`, `prepared`, `signing`, and `observing`; terminal states are `complete`, `conflict`, `expired`, and `cancelled`.

Only `pending` and `prepared` requests are TTL-expirable. Once the one-time Keychain gate begins, a request remains `signing`/`observing` until exact read-only observation resolves it or staff records a definite Keychain cancellation. Restart, request TTL, or a later onboarding gate change must not turn a post-Keychain request back into a retryable request.

A high-entropy idempotency key makes ambiguous customer request creation recoverable without generating a duplicate account request. Exact retries return the same durable request; reuse with different request data is refused. Durable live/daily limits bound aggregate request creation in addition to the per-connection route rate seam.

One configured creator account may hold one prepared/signing/observing transaction lane at a time. That lane is released only when the request returns to a pre-signing terminal state or reaches a post-signing terminal state.

## Merchant-configurable policy

The source defaults are `$5.00` for the in-person fee and `5.000 HP` for the starter delegation, but both are merchant-configurable values rather than fixed Hive-Bar economics.

Hive-Bar additionally requires a configured remaining-HP reserve after the proposed starter delegation. The reserve may be raised by the merchant but may never be configured below the platform floor of `10.000 HP`.

Claimed-account-token inventory has a merchant-configurable low-warning threshold, default `3`. Inventory below the threshold but above zero produces an authenticated staff warning. Zero ACT always blocks preparation/broadcast. Hive-Bar does not automatically replenish ACT.

The beta request limits remain configurable and are deliberately parsed above their current defaults so larger venue deployments can scale deliberately without changing the request-state architecture.

## Staff and authority boundary

Staff actions require the ordinary verified Hive session, exact application Origin, CSRF token, and exact configured creator account. The protected staff workflow is:

1. verify creator resource readiness while the fee control is still unavailable;
2. show a low-ACT warning when inventory is below the configured threshold but still nonzero;
3. require enough creator HP for the exact starter delegation **plus** the configured post-delegation reserve;
4. manually confirm the configured in-person fee only after readiness passes;
5. prepare the exact operation pair and review it;
6. immediately revalidate username availability, ACT availability, exact delegation capacity, and required remaining-HP reserve;
7. atomically move `prepared -> signing` before opening Hive Keychain;
8. submit the exact reviewed operations through browser-local Keychain with **Active** authority;
9. record the result once and then observe only.

The operation pair remains exactly `create_claimed_account` followed by `delegate_vesting_shares`. The source does not add a transfer, server signer, private-key path, ACT-claim transaction, or broadcast RPC. The normal Hive creator/recovery-account semantics remain unchanged.

A definite Keychain cancellation may move the signing request to terminal `cancelled`. Any accepted, uncertain, timed-out, or otherwise ambiguous post-gate outcome moves/remains in observation-only state. Hive-Bar must not automatically prepare or broadcast another transaction for that request.

## 4th Street Bar policy

For later 4th Street Bar activation, the accepted creator is `@fourthstreetbar`. Merchant Active authority remains under merchant control. Ordinary staff Posting access does not itself permit onboarding; an onboarding operator must have a deliberately authorized path to the creator Active authority through Keychain.

The initial beta policy uses the source defaults of `$5.00`, `5.000 HP`, `10.000 HP` minimum remaining reserve, ACT warning below `3`, 5 requests per 60 seconds per client, 25 simultaneous live requests, and 50 requests per rolling 24 hours. The fee, starter HP, reserve above the platform floor, ACT warning threshold, and capacity limits remain explicit merchant configuration.

A definite account-creation failure is expected to trigger an immediate refund under the venue operating procedure. An ambiguous Keychain outcome is not a definite failure and must first be resolved by observation so it cannot become a second account-creation attempt.

## Store and production posture

Production activation requires an already-prepared, non-symlink SQLite database at `/var/lib/hive-bar/onboarding/onboarding.sqlite3`, schema version 1, passing SQLite integrity and foreign-key checks. Onboarding-only routes fail closed if enabled storage is unavailable/corrupt; unrelated application surfaces remain live. `/readyz` includes the store check only when onboarding is enabled.

The repository includes a separate root-only storage-preparation helper and a narrow systemd writable-path drop-in. Those are provisioning assets, not activation. Merely merging C2-F/C2-F.1 must not create production storage or change systemd/runtime configuration.

## Explicit non-authorization

Source qualification does not authorize consuming an account-creation token or creating a Hive account. It does not authorize a Hive Power delegation, collecting cash from a tester, opening a real Keychain signing request, changing production environment files, installing the systemd drop-in, or enabling `HIVE_ONBOARDING_ENABLED`.

Those actions require separate integration, provisioning/deployment, and live-activation authorizations. A separate live acceptance authorization is required before any genuine customer onboarding transaction. C2-F/C2-F.1 source acceptance remains separate from live activation.
