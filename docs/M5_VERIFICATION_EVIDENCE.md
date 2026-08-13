# M5 verification evidence

Status: local deterministic implementation and declared-runtime gate complete; no physical-device, remote-CI, or live-payment evidence exists

Baseline: accepted M4 published commit `8eba9ca3b203df8a91c30fe6605ee3888927f89a`; tree `616ad7245a03cae17d6e78dd1b7f08c71c6af809`

Frozen specification: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Evidence date: 2026-08-13

## Product bindings

| Binding | Recorded value |
| --- | --- |
| Merchant allowlist | `fourthstreetbar`, supplied explicitly by the product owner on 2026-08-13 |
| Controlled maximum | `1.000 HBD` |
| Minimum later live exit-gate payment | `0.001 HBD`; not prepared, authorized, or broadcast in this implementation step |
| Distriator claim URL | `https://distriator.com/#/claim`, supplied explicitly by the product owner on 2026-08-13 |
| Distriator eligibility | Not yet authoritatively confirmed; `DISTRIATOR_ENABLED=false` remains the accepted setting |

## Local implementation evidence

| Control | Local evidence |
| --- | --- |
| URI dependency | Exact `hive-uri@0.2.8` lockfile integrity; lockfile SHA-256 `b44c11c35965db23a4088be416af624062b5140682110452e0273939ed3ab18c`; reproducible `patches/hive-uri+0.2.8.patch` SHA-256 `e68145d75b25e660098569dc5c8211898cc680ea7f0f8a8e5ee5022be0b7fe8b`; compatibility tests cover the documented specialized transfer and encoded operation forms and stable malformed-input rejection |
| QR dependency | Exact `@zxing/browser@0.2.1`; only its local UMD build is served under the application's own origin |
| Negative corpus | Invalid scheme/base64url/UTF-8/size, multi-op, wrong op/signer/recipient/asset/authority, non-positive/non-canonical/excess amount, missing memo, extra field, no-broadcast, and absent allowlist fail closed |
| Immutable review | Server resolves one canonical `transfer`, freezes its fields, fingerprints exact JSON, and requires the existing exact-operation dialog before Keychain |
| Keychain boundary | Browser requests exactly one Active-authority broadcast after review; cancellation and pre-broadcast failures durably cancel and never open a retry path |
| State truthfulness | `Validated`, `AwaitingSignature`, `BroadcastAccepted`, `ConfirmationTimeout`, `ChainConfirmed`, and `Cancelled` are persisted; only `ChainConfirmed` maps to **Paid** |
| Persistence | Strict SQLite schema, schema version, prepared statements, unique active fingerprint, unique non-null transaction ID, compare-and-set transitions, pending timeout, and same-account recovery after a new verified session |
| Chain confirmation | The returned transaction ID and exact operation are queried independently on every configured node; two exact matching observations are required; any concrete mismatch or block/index disagreement remains pending |
| Rebate boundary | Claim action is hidden until `ChainConfirmed`, opens only the configured HTTPS URL with `noopener noreferrer`, and is absent while `DISTRIATOR_ENABLED=false` |
| Reconciliation language | UI states that the Hive-Bar receipt does not replace V4V/POS business reconciliation and that Distriator controls its own terms and outcome |
| Security boundary | Same-origin, server session, CSRF, controlled-account allowlist, server merchant allowlist, exact HBD ceiling, read-only RPC allowlist, CSP, local Keychain, and no server broadcast method remain enforced |

## Validation record

The exact lockfile was reinstalled with both full `npm ci` and production-only `npm ci --omit=dev`; each postinstall step reapplied the `hive-uri@0.2.8` patch successfully. The complete deterministic gate then passed under declared runtime Node `v24.19.0`:

- 140 tests passed; 0 failed, skipped, or cancelled;
- secret scan passed across 144 repository files;
- ESLint passed with zero warnings;
- production Tailwind CSS build passed; and
- production dependency audit reported zero vulnerabilities.

`git diff --check` also passed. The host's default Node `v24.14.0` produced the expected pre-stability SQLite warning during an earlier compatibility replay; the controlling final replay used Node `v24.19.0`, which satisfies package engine `>=24.15 <25` and produced no SQLite stability warning.

No Keychain request, Hive operation, remote CI run, branch creation, commit, push, or PR change occurred during local implementation.

## Open M5 acceptance gates

- deterministic remote CI on the exact published candidate;
- physical-device camera and QR-image rehearsal, stopping at exact review;
- authoritative confirmation of current 4th Street Bar Distriator eligibility before enabling its link; and
- one separately authorized, fingerprint-bound `0.001 HBD` payment to `@fourthstreetbar`, exact two-node confirmation, durable receipt verification, and V4V/POS reconciliation.

Until every applicable gate is recorded, M5 is a controlled candidate. No authorization for preparation, Keychain, payment, retry, or broadcast may be inferred from this evidence.
