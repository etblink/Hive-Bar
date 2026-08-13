# M5 verification evidence

Status: the current-V4V empty-payer remediation is published and has passed deterministic Ubuntu/Windows CI. The authorized physical-device preparation gate passed and was durably cancelled before Keychain. No live payment exists; M5 remains controlled pending the exact payment and confirmation gate.

Baseline: accepted M4 published commit `8eba9ca3b203df8a91c30fe6605ee3888927f89a`; tree `616ad7245a03cae17d6e78dd1b7f08c71c6af809`

Frozen specification: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Evidence date: 2026-08-13

## Product bindings

| Binding | Recorded value |
| --- | --- |
| Merchant allowlist | `fourthstreetbar`, supplied explicitly by the product owner on 2026-08-13 |
| Controlled maximum | `1.000 HBD` |
| Minimum later live exit-gate payment | `0.100 HBD`, confirmed by the product owner from the current physical V4V HBD receive flow on 2026-08-13; the preparation gate passed, but no broadcast or payment is authorized by this evidence |
| Distriator claim URL | `https://distriator.com/#/claim`, supplied explicitly by the product owner on 2026-08-13 |
| Distriator eligibility | Read-only audit of the official public directory on 2026-08-13 found exactly one `Fourth Street Bar` listing at `1114 E. 4th Street, Reno, NV, 89512` and displayed `Only 30 unverified claims left.` The public record does not expose its Hive payout account; the separate current V4V invoice resolved that payment binding to `fourthstreetbar`. `DISTRIATOR_ENABLED=false` remains the accepted candidate setting until the live payment gate is complete. |

## Local implementation evidence

| Control | Local evidence |
| --- | --- |
| URI dependency | Exact `hive-uri@0.2.8` lockfile integrity; lockfile SHA-256 `b44c11c35965db23a4088be416af624062b5140682110452e0273939ed3ab18c`; reproducible `patches/hive-uri+0.2.8.patch` SHA-256 `e68145d75b25e660098569dc5c8211898cc680ea7f0f8a8e5ee5022be0b7fe8b`; compatibility tests cover the documented specialized transfer, encoded operation, and current V4V exact-empty-payer forms plus stable malformed-input rejection |
| QR dependency | Exact `@zxing/browser@0.2.1`; only its local UMD build is served under the application's own origin |
| Negative corpus | Lightning/LNURL input, invalid scheme/base64url/UTF-8/size, multi-op, wrong op/signer/recipient/asset/authority, whitespace or foreign payer, non-positive/non-canonical/excess amount, missing memo, extra field, no-broadcast, and absent allowlist fail closed |
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

## Publication and remote-CI evidence

The original M5 implementation was published as equivalent commit `9003519ff3f9a75b2bf50a447f8467112cbdc209`, tree `4556b8d6548ee0e7922e67207743ab451c0fba85`. CI run `31682683076` correctly failed with 139/140 tests because the existing workflow used `npm ci --ignore-scripts` without explicitly applying the pinned patch. Its live-read job was skipped.

The workflow remediation was published as equivalent fast-forward child `434be7a8f4565bdae32c5c0caf7ad3725bc8d047`, tree `360121aef784942bde4b08c1b765af5cb230a58a`. CI run `31683474576` then passed the explicit `patch-package 8.0.1` step, 141/141 tests, secret scan, zero-warning lint, production build, and production audit. Its live-read job was skipped, and temporary branch `codex/m5-ci-validation` was verified deleted.

The Windows portability remediation was published as equivalent fast-forward child `ada990d0009fc21f7bd34d49421a6a90392bcb6a`, tree `06e2b4070d9a4a4f80923e18f7711e0aa431eccc`. Cross-platform CI run `31686321120` passed 142/142 tests on both Ubuntu and Windows together with the secret scan, zero-warning lint, production build, and production audit. Its live-read job was skipped, and temporary branch `codex/m5-ci-validation` was verified deleted.

The current-V4V exact-empty-payer remediation was committed locally as `a98f70ddf0fabc0857ed30056a8db70f62b4a4a9`, tree `dc7a95831e99135952f91cb879c38cc247576196`, with patch SHA-256 `e3b6c8df23131b81784b015d790e735e473ff6658945d7ee4467dafdeb587237`. It was published as equivalent fast-forward child `bb88a4116f060c495c897b622c1dfd3f61e211fb` with the same tree. Cross-platform CI run `31691781934` passed 144/144 tests on both Ubuntu and Windows together with the secret scan, zero-warning lint, production build, and production audit. Its live-read job was skipped, and temporary branch `codex/m5-ci-validation` was verified deleted.

## Windows physical-device preparation incident

The product owner authorized exactly one preparation-only rehearsal on published candidate `434be7a8f4565bdae32c5c0caf7ad3725bc8d047`, tree `360121aef784942bde4b08c1b765af5cb230a58a`, for `0.001 HBD` from `@etblink` to `@fourthstreetbar`. The Windows clean checkout passed 139/141 tests and stopped before controlled-server startup. Therefore no Posting sign-in, QR scan, payment preflight, Active request, Keychain broadcast, Hive operation, or payment occurred.

Both failures were deterministic line-ending assumptions in `test/payment-dependency-provenance.test.js`:

- Git converted `patches/hive-uri+0.2.8.patch` from canonical LF to CRLF. Its raw working-tree hash became `fea7b742e98481e60e2bf77fe51cf325efa9cb22a6f58867f8ecc2eb7eac342d` instead of canonical LF hash `e68145d75b25e660098569dc5c8211898cc680ea7f0f8a8e5ee5022be0b7fe8b`.
- The workflow check searched for an LF-only multiline sequence, yielding zero matches under CRLF; normalization restored the required two matches.

The payment decoder's specialized and encoded URI tests passed on Windows, so the incident did not expose a payment-decoding defect. Exact run-specific temporary files were subsequently removed with validated paths, and cleanup completed independently. The preparation authorization is consumed and does not permit a retry.

The cross-platform remediation adds targeted LF attributes for patch/workflow files, canonicalizes text only for provenance comparison, simulates both LF and CRLF fixtures, and requires the deterministic verification job on both Ubuntu and Windows. This does not authorize another physical-device attempt.

The remediated local tree passed the exact script-disabled install followed by explicit `patch-package 8.0.1`, the canonical and simulated-Windows provenance checks, and the complete Node `v24.19.0` gate: 142/142 tests, 145-file secret scan, zero-warning lint, production build, and zero-vulnerability production audit.

## Current V4V physical-device preparation incidents

The product owner next authorized exactly one preparation-only physical-device rehearsal on published candidate `ada990d0009fc21f7bd34d49421a6a90392bcb6a`, tree `06e2b4070d9a4a4f80923e18f7711e0aa431eccc`, nominally for `0.001 HBD` from `@etblink` to `@fourthstreetbar`. The clean Windows checkout passed 142/142 tests and one Posting sign-in was approved. The first QR was generated in V4V's Lightning mode. The browser camera had selected an OBS virtual camera and did not decode it; the authorized local image fallback decoded one `lightning:lnurl...` payload. Hive-Bar rejected it before preflight, created no receipt, reached no exact-operation review or Active-authority path, and performed no broadcast or payment. Cleanup completed independently.

The product owner then corrected the camera selection, generated a proper current V4V Hive HBD invoice, and repeated the local procedure without a new retry authorization. That repetition is diagnostic evidence only and cannot satisfy the preparation gate. The physical camera decoded the QR exactly once. Its operation shape was one transfer with an exact empty `from` value, recipient `fourthstreetbar`, amount `0.100 HBD`, and a present V4V memo. The actual one-time memo and URI are deliberately not recorded in the repository. Hive-Bar rejected the empty payer as invalid before creating a receipt or opening review. No fingerprint, Active request, broadcast, Hive operation, or payment existed, and cleanup again completed independently.

The product owner clarified that current V4V requires a minimum `0.100 HBD` Hive invoice, not `0.001 HBD`. The camera issue was local device selection, while the blank payer exposed a bounded compatibility gap. The remediation now:

- distinguishes Lightning input with specific Hive-HBD guidance;
- accepts only `transfer.from === ""` as the current V4V payer placeholder;
- binds that placeholder only to the already verified server-session account before persistence, review, and fingerprinting;
- continues to reject missing, whitespace, malformed, non-canonical, foreign, signer-mismatched, or wrong-authority senders; and
- tests a non-sensitive hard-coded URI structurally equivalent to the observed current V4V format through both the decoder and authenticated preflight API.

The complete local remediation gate passed on 2026-08-13: 144/144 tests, a 146-file secret scan, zero-warning lint, production CSS build, and zero-vulnerability production audit. No Keychain request, Hive operation, payment, or physical-device retry occurred during implementation.

## Successful physical-device preparation gate

The product owner authorized exactly one preparation-only rehearsal on published candidate `bb88a4116f060c495c897b622c1dfd3f61e211fb`, tree `dc7a95831e99135952f91cb879c38cc247576196`, from `@etblink` to `@fourthstreetbar` for the current V4V minimum of `0.100 HBD`. The clean Windows checkout passed 144/144 tests before controlled-server startup. At most one Posting sign-in was approved, and the physical camera decoded exactly one current V4V Hive payment QR.

The **Review exact Hive operation** dialog opened and showed Active authority, exactly one transfer, resolved sender `etblink`, recipient `fourthstreetbar`, amount `0.100 HBD`, and memo `v4v-dUq0a`. Every bound field matched. The immutable operation fingerprint was `78c390432962aec3ff718c96931cb29576ff5b95255e285d164d2704b09e38b1`.

The product owner cancelled at review before Keychain. Hive-Bar displayed `Cancelled before broadcast. Nothing was paid.` and `Cancelled before Keychain. Nothing was broadcast.` No Active Keychain popup appeared. The durable receipt independently verified state `Cancelled`, account `@etblink`, merchant `@fourthstreetbar`, amount `0.100 HBD`, Active authority, the exact fingerprint above, and no transaction. No error text appeared, and cleanup completed independently.

This preparation gate therefore passes. No Keychain Active request, broadcast, Hive operation, or payment occurred. The cancelled receipt is terminal, and its fingerprint is evidence only; it does not authorize or identify a future payment operation.

After this evidence update, the complete deterministic local gate passed under Node `v24.19.0`: 144/144 tests, a 146-file secret scan, zero-warning lint, production CSS build, and zero-vulnerability production audit.

## Current Distriator read-only audit

On 2026-08-13, the official public [Distriator businesses directory](https://distriator.com/#/businesses) contained 630 businesses. Searching `fourth street bar` returned exactly one result and its public [Fourth Street Bar record](https://distriator.com/#/business/Fourth%20Street%20Bar) matched the expected Reno name and address, identified the business as a bar, displayed HBD support, and stated `Only 30 unverified claims left.` The record marked its onboarding post pending.

This establishes a current public Distriator listing and displayed claim capacity for the tested business. The page does not expose a Hive payout account, so it does not independently prove the `@fourthstreetbar` account binding; that binding is separately evidenced by the exact decoded V4V HBD invoice and the successful controlled preflight above. No login, claim, Keychain request, Hive-Bar live-read smoke, Hive operation, or other external action was performed during this audit.

## Open M5 acceptance gates

Deterministic cross-platform CI, the physical-device preparation gate, and current public Distriator listing verification are complete. The remaining acceptance gate is one separately authorized, newly fingerprint-bound `0.100 HBD` payment to `@fourthstreetbar`, exact two-node confirmation, durable receipt verification, and V4V/POS reconciliation. Enabling the Distriator link is a final accepted-configuration decision after that payment gate, not an authorization inferred from this document.

Until every applicable gate is recorded, M5 is a controlled candidate. No authorization for preparation, Keychain, payment, retry, or broadcast may be inferred from this evidence.
