# Hive-Bar M15.4 Wallet and Pay Modernization

Status: **CORRECTED CANDIDATE IMPLEMENTATION — OWNER REVIEW REQUIRED**

## 1. Binding

M15.4 is rooted directly at accepted M15.3 source:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `54cfee5fba8fb748163ced53ec8acd42eb202a15`
- parent tree: `08aa0ad7882f2a698d16b4767821494ff175b386`
- governing specification: `docs/HIVE_BAR_M15_UI_UX_MODERNIZATION_SPECIFICATION_0_1_0.md`
- accepted shell: `docs/M15_2_APPLICATION_SHELL_AND_DESIGN_PRIMITIVES.md`
- accepted social surfaces: `docs/M15_3_CORE_SOCIAL_SURFACES.md`

M15.4 is source-only and presentation-only. It does not authorize or perform a Privex deployment, payment-window activation, Hive write, Keychain transaction request, genuine purchase, Distriator activation, DNS/Cloudflare/Caddy change, or PR #1 mutation.

## 2. Purpose

M15.4 modernizes the two remaining finance-facing surfaces without changing their behavior:

1. public Hive wallet summary;
2. 4th Street Bar HBD Pay Tab and durable receipt.

The design goal is a familiar modern social/payment experience in which human-readable identity and state are primary while blockchain proof remains inspectable.

## 3. Audit result

The accepted source already exposes every value and hook needed for this pass.

Wallet already provides liquid HIVE, liquid HBD, Hive Power, regenerated voting power, regenerated resource credits, the existing beer-themed HP milestone, claimable rewards, and the exact owner-only reward-claim gate.

Pay already provides verified-session binding, current V4V/POS Hive URI intake, local camera/image QR decoding, exact server preflight, merchant allowlist and controlled maximum, exact operation/fingerprint review, browser-local Active-authority Keychain handoff, durable receipt state, no automatic retry after ambiguity, two-node exact irreversible confirmation before Paid, safe receipt recheck, merchant V4V/POS reconciliation disclosure, and separately gated Distriator handling.

Therefore no payment JavaScript, route, observer, receipt store, invoice decoder, release gate, payment-window helper, wallet calculation, or Privex file changes.

## 4. Presentation architecture

M15.4 adds one local stylesheet:

`public/css/m15-wallet-pay.css`

To preserve the accepted M15.3 Home document and its exact stylesheet contract, M15.4 does **not** modify `views/common/head.ejs`. The local stylesheet is loaded only by the full Profile document and the Pay document:

- `views/pages/profile/index.ejs`
- `views/pages/pay/index.ejs`

This means ordinary Home/Community/Conversation documents retain the exact accepted M15.3 stylesheet set. HTMX wallet fragments inherit the stylesheet already loaded by the Profile document.

The stylesheet uses accepted `--hb-*` tokens and contains no remote asset, external font, script, or `url(...)` dependency.

## 5. Wallet presentation

The public wallet becomes a quieter social-account surface:

- `@account wallet` and `Public on Hive` establish identity and scope;
- liquid HIVE, liquid HBD, and HP are the primary balance row;
- the read-only boundary is immediately visible;
- voting power and RC are grouped as account-resource health;
- the beer pitcher remains as a distinctive resource visualization rather than dominating the page;
- HP milestone and claimable rewards are secondary modules;
- the existing reward action remains visible only when the accepted owner and controlled-write conditions permit it;
- exact balances are still re-fetched before any reward-signing request;
- the accepted `Calculated at` snapshot wording remains present for compatibility and provenance clarity.

No send, transfer, swap, fiat valuation, portfolio total, price, or invented wallet capability is added.

## 6. Pay presentation

Pay becomes merchant-first rather than milestone/internal-label-first:

- exact local 4th Street Bar logo and venue identity lead the page;
- merchant account and controlled maximum remain visible;
- the payment safety model is stated before the invoice form;
- Step 1 is current invoice capture/validation;
- Step 2 is durable receipt and chain confirmation;
- transaction ID and operation fingerprint remain inspectable proof fields;
- pending/ambiguous states explicitly say not to pay again;
- receipt recheck remains an observation of the existing transaction, never a new transfer;
- the accepted warning `Hive HBD payment QR—not a Lightning or LNURL invoice` remains exact;
- Distriator remains separate and disabled unless independently configured and eligible.

M15.4 does not invent itemized drinks, USD equivalents, subtotal, suggested tip, ETA-to-confirmation, cashback percentage, or a fake merchant-order identifier.

## 7. Payment semantic invariants

M15.4 preserves the accepted M14/M5 model exactly:

1. verified session before payment;
2. same-origin and CSRF enforcement at the payment API;
3. exact payer and merchant binding;
4. HBD amount bounded by accepted configuration;
5. one exact transfer operation;
6. exact operation and fingerprint reviewed before signing;
7. Active authority only for the actual payment handoff;
8. Keychain acceptance is not Paid;
9. no automatic retry after cancellation, timeout, missing transaction ID, node disagreement, or other ambiguity;
10. Paid only after at least two independent nodes agree on the exact transaction and irreversibility;
11. durable same-account receipt recheck remains possible after the write window closes;
12. merchant V4V/POS reconciliation remains independent evidence;
13. Distriator remains outside payment acceptance.

## 8. Exact changed-file scope

The corrected candidate changes exactly seven presentation/test/documentation files:

- `views/pages/profile/index.ejs`
- `views/pages/profile/partials/user-wallet.ejs`
- `views/pages/pay/index.ejs`
- `views/pages/pay/partials/receipt.ejs`
- `public/css/m15-wallet-pay.css`
- `test/m15-wallet-pay.test.js`
- `docs/M15_4_WALLET_PAY_MODERNIZATION.md`

`views/common/head.ejs` is unchanged from accepted M15.3.

## 9. Explicitly unchanged safety-critical files

The candidate leaves these accepted files byte-identical:

- `public/js/pay-tab.js`
- `routes/payments.js`
- `src/payments/invoice-decoder.js`
- `src/payments/payment-observer.js`
- `src/payments/receipt-store.js`
- `src/release/payment-readiness.js`
- `src/release/payment-storage.js`
- `ops/privex/bin/hive-bar-payment-window-enable`
- `ops/privex/bin/hive-bar-payment-window-disable`
- `ops/privex/bin/hive-bar-prepare-payment-storage`
- `ops/privex/hive-bar-payment.service.d/10-payment-storage.conf`

The final Git compare is the authoritative verification of that invariant.

## 10. First-pass CI correction

The first PR #8 validation run exposed three presentation compatibility regressions while all six new M15.4 tests and the payment state-machine/security gates passed:

- the wallet changed the accepted literal `Calculated at` wording;
- the global `<head>` gained a third stylesheet, conflicting with the M15.3 Home exact stylesheet assertion;
- the Pay copy shortened the accepted literal `Hive HBD payment QR—not a Lightning or LNURL invoice` warning.

The corrected candidate restores both accepted literals and scopes the M15.4 stylesheet only to Profile and Pay. No existing test or safety gate is weakened. The temporary branch is rewritten to one clean corrected commit rooted directly at accepted M15.3 before final CI.

## 11. Automated M15.4 checks

`test/m15-wallet-pay.test.js` verifies human-first public wallet presentation, absence of public reward-claim controls, exact existing owner reward-claim gating, exact local venue identity on Pay, irreversible two-node confirmation language, explicit no-retry language, signed-out payment unavailability, preservation of every existing `data-pay-*` browser hook, the Active-authority review boundary, Distriator disabled by default, accepted browser payment state-machine source semantics, local token-driven CSS, and absence of mockup-only USD/itemized-tab concepts.

All existing security, accessibility, responsive, M4, M5, M14, payment API, observer, receipt-store, Keychain, M15.2, and M15.3 tests remain authoritative.

## 12. Acceptance gate

M15.4 source acceptance requires:

- exact parent `54cfee5fba8fb748163ced53ec8acd42eb202a15`;
- exactly one candidate commit ahead and zero behind accepted source;
- exactly the seven declared changed files;
- `views/common/head.ejs` unchanged;
- no payment JavaScript/route/service/release/operations changes;
- existing exact logo asset unchanged;
- Ubuntu deterministic CI pass;
- Windows deterministic CI pass;
- all existing accessibility/responsive tests pass;
- all existing M4/M5/M14/payment tests pass;
- all M15.2/M15.3 tests pass;
- all M15.4 tests pass;
- no Hive write or Keychain request;
- no payment window activation;
- no genuine purchase;
- no Privex deployment;
- PR #1 untouched.

After accepted M15.4 integration, M15.5 is the cross-platform acceptance and release-readiness phase. Any deployment remains a separate explicit authorization boundary.
