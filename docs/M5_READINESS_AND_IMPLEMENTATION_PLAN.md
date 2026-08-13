# M5 readiness and implementation plan

Status: **Deterministic local implementation and current-V4V compatibility remediation complete.** M4 is accepted. The remediation successor's remote CI, physical-device, live-payment, and rebate-eligibility acceptance gates remain deliberately blocked until the separately authorized evidence listed below exists.

Plan date: 2026-08-12

Frozen specification: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Accepted M4 baseline: published commit `8eba9ca3b203df8a91c30fe6605ee3888927f89a`; tree `616ad7245a03cae17d6e78dd1b7f08c71c6af809`

## Scope and safety boundary

M5 adds the verified Pay Tab and a conditional handoff to the official Distriator claim experience. It does not release general production writes, infer a merchant from M4 test accounts, replace V4V/POS business reconciliation, or permit an unbound or automatic transfer.

The deterministic implementation may use fixtures and mocked Keychain/RPC boundaries. A real payment remains a later, separately authorized controlled operation with an exact account, amount, operation JSON, and fingerprint. No automatic retry or rebroadcast is permitted.

M5 exits only when:

- the negative QR corpus passes;
- the UI cannot show **Paid** before exact chain confirmation;
- one separately authorized minimum-value real HBD payment is confirmed and reconciled; and
- the external rebate language is accurate.

## Requirement traceability

| Requirement | Planned control and evidence |
| --- | --- |
| PAY-01 | Require a verified patron session and an available Keychain Active-authority path before payment preparation. |
| PAY-02 | Offer camera scan plus explicit text-paste and image-import fallbacks; camera denial cannot block safe intake. |
| PAY-03 | Decode Hive payment URIs through a pinned, audited `hive-uri` decoder. No application-owned base64 or generic URI-operation parser is allowed. |
| PAY-04 | Accept the library-defined specialized transfer form and encoded single-operation form after the decoder compatibility gate below passes. |
| PAY-05 | Resolve exactly one `transfer`; reject zero, multiple, or unsupported operations. |
| PAY-06 | Require the transfer sender to equal the verified account, a library-supported signer placeholder, or the exact empty payer placeholder emitted by current V4V HBD invoices. Resolve either placeholder only to the server-verified session account. |
| PAY-07 | Require positive HBD with exactly three decimal places, at or below the configured maximum, and a recipient in the server-side merchant allowlist. |
| PAY-08 | Freeze sender, recipient, asset, amount, and memo after validation. A changed invoice requires a new scan and fingerprint. |
| PAY-09 | Ignore invoice-supplied callbacks, redirects, and other navigation targets. |
| PAY-10 | Display the exact immutable transfer and operation fingerprint before opening Keychain. |
| PAY-11 | Fail closed on malformed encoding or UTF-8, oversize input, multiple operations, wrong asset, wrong recipient, wrong signer, missing memo, non-positive or excessive amount, and duplicate payment. |
| PAY-12 | Submit only the reviewed exact transfer from the verified sender through Keychain Active authority. |
| PAY-13 | Treat cancellation and Keychain failure as unpaid terminal outcomes; never retry automatically. |
| PAY-14 | Treat Keychain success only as `BroadcastAccepted`; never label it **Paid**. |
| PAY-15 | Correlate the returned transaction ID with a chain-observed transfer before confirmation. |
| PAY-16 | Require exact sender, recipient, HBD units, amount, and memo equality; partial matches remain unconfirmed. |
| PAY-17 | Corroborate the exact observation on two independent Hive nodes. Node disagreement remains pending with a non-payment diagnostic. |
| PAY-18 | Persist a receipt containing sender, merchant, exact HBD amount, timestamp, transaction ID, block, and state. |
| PAY-19 | Enforce unique operation fingerprints and transaction IDs so a confirmed receipt cannot be duplicated. |
| PAY-20 | On timeout, preserve a recoverable pending receipt and offer a chain recheck before any new-payment path. |
| PAY-21 | Never automatically rebroadcast, including after timeout or ambiguous RPC responses. |
| PAY-22 | State that the Hive-Bar receipt is user-facing evidence and does not replace the merchant's V4V/POS reconciliation. |
| REB-01 | Hide or disable the claim action until a qualifying receipt reaches `ChainConfirmed`. |
| REB-02 | Open only the configured official HTTPS claim URL in a new tab with `noopener,noreferrer`. |
| REB-03 | Explain that Distriator is external and controls its own eligibility, documentation, timing, review, and payout. |
| REB-04 | Display no cashback percentage without a separately verified current integration contract. |
| REB-05 | Do not represent claim completion or track rebate status without a separately approved integration. |
| REB-06 | Default the feature to disabled unless 4th Street Bar's current eligibility and exact official URL are verified. |

## Existing foundation and isolated gaps

| Area | Reuse from accepted M4 | M5 work required |
| --- | --- | --- |
| Identity and authorization | Verified Keychain sessions, controlled-account checks, CSRF/origin controls, Active-authority adapter, and 120-second interactive timeout | Add payment-specific eligibility and keep live use controlled until a later release gate |
| Exact operation review | Canonical operation fingerprints, immutable JSON review, and explicit Keychain continuation | Add a transfer-invoice model and payment-state copy that distinguishes broadcast from confirmation |
| Chain reads | RPC timeout/failover controls and exact transfer field matching | Add two-node independent corroboration, transaction correlation, pending recheck, and disagreement diagnostics |
| Duplicate protection | Short-lived in-memory preflight deduplication | Add a durable receipt database with unique fingerprint and transaction constraints |
| UI | Accessible server-rendered pages and progressive HTMX/client enhancement | Add Pay Tab route, camera scanner, paste/import fallbacks, immutable summary, lifecycle status, and receipt view |
| Tests | Deterministic Keychain, browser-flow, RPC, accessibility, security, and build gates | Add the negative QR corpus, state-machine tests, durable-store tests, two-node cases, restart recovery, and physical-device evidence |
| Rebate handoff | Safe external-link patterns are available | Add a disabled-by-default, configuration-bound official Distriator link and accurate external-service language |

The current in-memory `PreflightStore` must not be repurposed as the receipt ledger: its TTL and process lifetime are incompatible with PAY-18 through PAY-20.

## Dependency gates and decisions

### Hive URI decoding

`hive-uri@0.2.8` is pinned exactly. A local compatibility spike found that its encoded transaction, encoded operation, and encoded operation-list paths resolve a single transfer correctly. The same spike found two published-package defects:

- the package's documented specialized `hive://sign/transfer/...` decoder path is not active in the published 0.2.8 decoder; and
- malformed input can surface an error-normalization `TypeError` under Node 24 instead of a stable validation error.

The implementation does not work around this with an application-owned parser. A reproducible `patch-package` compatibility patch restores the library's documented specialized-transfer decoder and stable malformed-input errors. `package-lock.json` preserves the upstream package integrity, `patches/hive-uri+0.2.8.patch` preserves the exact delta (SHA-256 `e68145d75b25e660098569dc5c8211898cc680ea7f0f8a8e5ee5022be0b7fe8b`), and the positive plus negative compatibility corpus binds both required URI forms before intake can be enabled.

A physical-device rehearsal subsequently established that current V4V HBD operation URIs encode `transfer.from` as the exact empty string. Hive-Bar treats only that exact value as a payer placeholder and substitutes the already verified server-session account before freezing and fingerprinting the operation. Missing, whitespace, malformed, non-canonical, foreign, or signer-mismatched senders remain rejected. This is a bounded payer resolution, not permission to edit invoice fields in the browser.

Package reference: [`hive-uri`](https://www.npmjs.com/package/hive-uri).

### QR capture

Use `@zxing/browser@0.2.1`, pinned exactly, for camera and image decoding. It provides browser camera, image, video, and `BrowserQRCodeReader` support. Keep direct text paste available so QR permission or device limitations never force an unsafe workaround.

Project reference: [`zxing-js/browser`](https://github.com/zxing-js/browser).

### Persistent receipt store

Use a narrow receipt-store interface with a file-backed `node:sqlite` implementation for M5. Require Node `>=24.15 <25` before adopting the current SQLite release-candidate API; use prepared statements, explicit transactions, a unique fingerprint, a unique non-null transaction ID, and a schema migration/version table. The interface preserves a future Postgres path without coupling payment logic to one database.

Runtime reference: [Node.js 24 SQLite documentation](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

## Configuration contract

| Setting | Rule | Readiness value |
| --- | --- | --- |
| `HIVE_PAYMENT_MERCHANT_ACCOUNTS` | Required comma-separated server allowlist; absent means Pay Tab disabled | `fourthstreetbar`, supplied by the product owner on 2026-08-13 |
| `HIVE_PAYMENT_MAX_HBD` | Exact three-decimal upper bound, enforced server-side and client-side | Recommend `1.000 HBD` for controlled M5; production ceiling deferred to M6 |
| `HIVE_PAYMENT_RECEIPT_DB_PATH` | Explicit writable SQLite file; never a broad or implicit directory | Bind to an application-data path in each environment |
| `HIVE_PAYMENT_CONFIRMATION_TIMEOUT_MS` | Pending observation window; timeout never implies failure or permits rebroadcast | Recommend `120000` for controlled M5, followed by safe recheck |
| `DISTRIATOR_ENABLED` | Explicit feature switch | `false` until REB-06 verification passes |
| `DISTRIATOR_CLAIM_URL` | Exact official HTTPS URL, accepted only when the feature is enabled | `https://distriator.com/#/claim`, supplied by the product owner on 2026-08-13 |

The merchant binding came from the product owner's explicit statement; it was not inferred from `@etblink`, `@fartman69`, prior M4 transfers, a display name, or search results. A controlled payment must still use V4V's current **Hive HBD** payment mode—not its Lightning/LNURL mode—and its decoded recipient must be exactly `@fourthstreetbar`. The official V4V POS page identifies its Receive flow as the source of a Hive payment QR: [V4V POS](https://v4v.app/pos).

The product owner supplied the exact claim URL, but did not separately attest current 4th Street Bar eligibility. `DISTRIATOR_ENABLED` therefore remains `false`. The deterministic enabled-path test verifies the supplied URL, new-tab isolation, and confirmation gate without claiming current eligibility. General service reference: [Distriator on Hive](https://hive.blog/@thedistriator).

## Architecture and state model

Recommended module boundaries:

- `src/payments/invoice-decoder.js`: pinned library adapter, size limits, canonical resolution, and typed rejection reasons;
- `src/payments/invoice-decoder.js`: pinned library adapter, exact HBD parsing, allowlist validation, signer resolution, immutable operation, and fingerprint;
- `src/payments/receipt-store.js`: SQLite schema, prepared statements, transition preconditions, uniqueness, and same-account restart recovery;
- `src/payments/payment-observer.js`: transaction-ID correlation and independent two-node exact observation;
- `routes/payments.js`: authenticated Pay Tab, preflight, status, and safe recheck endpoints;
- `public/js/pay-tab.js`: camera/import/paste intake, immutable review, one Keychain call, and status rendering;
- `views/pages/pay/index.ejs`: accessible Pay Tab and receipt surface;
- `docs/M5_CONTROLLED_PAYMENT_RUNBOOK.md`: fixture-first and exact-authorization live procedure;
- `docs/M5_VERIFICATION_EVIDENCE.md`: deterministic, remote, physical-device, and controlled-live evidence.

The persisted state machine is:

1. `Scanned` — raw input exists only inside bounded intake.
2. `Validated` — exactly one allowed immutable transfer and fingerprint are persisted.
3. `AwaitingSignature` — the exact-operation dialog was accepted and one Keychain request is outstanding.
4. `BroadcastAccepted` — Keychain returned a transaction ID; the UI says pending, never **Paid**.
5. `ChainConfirmed` — two independent nodes observed the exact transfer for that transaction ID; only now may the UI say **Paid**.
6. `RebateAvailable` — optional presentation state only when the receipt qualifies and REB-01 through REB-06 pass.

`Rejected` and `Cancelled` are terminal without broadcast. `ConfirmationTimeout` preserves the expected transfer and transaction ID as pending and exposes only safe recheck. Every transition uses a compare-and-set precondition so duplicate browser events cannot advance a receipt twice.

## Deterministic test and evidence plan

The negative corpus will bind at least:

- invalid scheme, invalid base64url, invalid percent encoding, invalid UTF-8, truncated input, and configured oversize input;
- zero operation, multiple operations, nested/unsupported operation, and extra transaction operations;
- wrong sender, unresolved or mismatched signer placeholder, wrong recipient, wrong asset, missing memo, and untrusted callback/redirect;
- zero, negative, excess precision, non-canonical, overflow, and above-limit amounts;
- duplicate fingerprint, duplicate transaction ID, stale browser event, cancellation, Keychain rejection, and late callback;
- transaction-not-found, partial field match, one-node-only observation, node disagreement, timeout, restart recovery, and later safe confirmation;
- proof that no state before `ChainConfirmed` renders **Paid** or enables the rebate action.

Positive fixtures cover both required Hive URI forms, a non-sensitive hard-coded equivalent of the current V4V empty-payer HBD format, exact three-decimal HBD arithmetic, immutable review, one Active call, two-node confirmation, durable receipt rendering, safe restart recheck, and the disabled/enabled Distriator boundary. The full existing deterministic gate, secret scan, zero-warning lint, build, production audit, accessibility checks, and a physical-device QR scan remain required.

## Consolidated implementation sequence

The product owner authorized batches 1 through 4 as one consolidated local step on 2026-08-13; the real payment remains separate.

1. **Foundation — implemented locally:** runtime and pinned packages, configuration validation, audited URI compatibility patch, exact invoice/operation parsing, and negative corpus.
2. **Durability and confirmation — implemented locally:** SQLite migration, receipt transitions, uniqueness, same-account recovery, independent two-node correlation, timeout, and safe recheck.
3. **User flow — implemented locally:** Pay Tab navigation, camera/import/paste intake, immutable review, one-call Keychain boundary, pending/confirmed receipt UI, accessibility, and disabled-by-default Distriator handoff.
4. **Verification — remediation local gate complete:** lockfile reinstall, deterministic tests, security review, and documentation include the current V4V format; a successful preparation-only physical-device rehearsal and exact successor remote CI remain required.
5. **Controlled live exit gate:** after separate fingerprint-bound authorization, perform one minimum current-V4V `0.100 HBD` payment to the bound merchant, observe exact two-node confirmation, reconcile the durable receipt, and preserve transaction evidence. No retry is implied or authorized.

## Readiness verdict and remaining decisions

The accepted M4 code is a sound base for M5. The merchant allowlist and claim URL are now bound from product-owner statements. The Project Lead controls remain:

- use a `1.000 HBD` maximum during controlled M5, with any production ceiling deferred to M6;
- use the product-owner-confirmed current V4V HBD minimum of `0.100 HBD` for the later controlled exit gate;
- keep Distriator disabled until current 4th Street Bar eligibility is authoritatively confirmed; and
- retain the provenance-pinned `hive-uri` compatibility patch and its corpus until an equivalently tested upstream release replaces it.

Full M5 acceptance additionally requires a later exact live-payment authorization. That future authorization must bind the candidate commit/tree, merchant, amount, memo, operation JSON, and fingerprint and permit exactly one Active Keychain request and broadcast. It cannot be inferred from this plan.

## Readiness-plan validation

The readiness-only baseline passed 119 tests on 2026-08-12. After M5 implementation, clean full and production-only `npm ci` installs reapplied the pinned `hive-uri` patch, and the complete gate passed under the declared Node `v24.19.0` runtime on 2026-08-13: 140 tests passed, the secret scan covered 144 repository files, ESLint completed with zero warnings, the production CSS build succeeded, and the production dependency audit reported zero vulnerabilities. The later cross-platform baseline passed 142 tests on both Ubuntu and Windows. The current-V4V empty-payer remediation passes 144 local tests, a 146-file secret scan, zero-warning lint, the production CSS build, and a zero-vulnerability production audit. No Keychain request or Hive operation occurred during remediation.
