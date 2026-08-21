# Hive-Bar C2-C Wallet Semantic Redesign

Status: **CORRECTED IMPLEMENTATION CANDIDATE — SOURCE QUALIFICATION REQUIRED**

## 1. Exact binding

C2-C is rooted directly at the accepted post-C2-B production/main source:

- parent commit: `e0d17a8edb8ce893983c68729d195ea2ac419153`
- parent tree: `4a7cc8800f4bc21c77c6b17097f2c3eada692c2f`
- accepted production build at authorization: `beta-e0d17a8`
- governing continuity freeze: `docs/HIVE_BAR_PRODUCT_CONTINUITY_AND_CYCLE_2_HANDOFF_0_5_0.md`

This candidate is source-only. It does not authorize integration into `main`, production deployment, live Hive writes, Keychain requests, payment activity, onboarding activation, controlled/delegated activation, infrastructure changes, DNS/Cloudflare changes, or dormant V1 activation.

## 2. Purpose

C2-C addresses the Wallet as a product-semantics and information-architecture problem rather than a wallet-backend problem.

The accepted wallet calculation already supplies the exact values required by the product:

- liquid HIVE;
- liquid HBD;
- effective Hive Power;
- regenerated voting power;
- regenerated Resource Credits;
- the existing HP-derived bar milestone;
- claimable HIVE, HBD, and Hive Power rewards.

C2-C therefore leaves wallet calculations and reads unchanged and changes only the way those exact values are presented.

The governing product principle is:

> Human and bar-oriented concepts lead. Exact Hive terminology and exact blockchain values remain visible, accurate, and inspectable underneath.

## 3. Patron-facing semantic model

### 3.1 Balances

The Wallet leads with plain-language liquid balances:

- `Available HBD` with secondary exact label `Liquid HBD`;
- `Available HIVE` with secondary exact label `Liquid HIVE`.

No fiat valuation, portfolio total, exchange rate, send, transfer, swap, buy, or sell capability is added.

HBD is not renamed to dollars, cash, or bar credit.

### 3.2 Bar level

The existing HP milestone lineage becomes a primary product concept:

- primary concept: `Your bar level`;
- primary value: the existing milestone name, such as `Regular Drinker`;
- secondary exact protocol term: `Hive Power`;
- exact HP quantity remains visible;
- the existing milestone progress percentage and thresholds remain authoritative.

C2-C does not change the milestone table or calculate a new rank.

### 3.3 Participation

Two Hive resource concepts are translated into patron-facing meaning while remaining exact:

- `Voting strength` with secondary exact label `Voting power`;
- `Activity capacity` with secondary exact label `Resource credits (RC)`.

The existing beer-pitcher lineage remains the voting-strength visualization and continues to use the exact existing voting-power percentage.

The RC meter continues to use the exact existing regenerated Resource Credits percentage.

### 3.4 Rewards

Rewards lead with `Ready to claim`, while `Claimable rewards` remains visible as the exact Hive-facing concept.

Exact HIVE, HBD, and Hive Power reward quantities remain unchanged.

The existing owner-only reward-claim form, preflight, operation construction, review, Keychain boundary, fingerprinting, cancellation, observation, and no-auto-retry behavior remain unchanged.

### 3.5 Education without jargon overload

The Wallet links quietly to the existing FAQ Wallet section using:

`What do these Hive terms mean?`

The Wallet does not duplicate the full FAQ explanations of HIVE, HBD, HP, RC, and voting power.

## 4. Exact changed-file scope

The corrected candidate changes exactly six files:

1. `views/pages/profile/partials/user-wallet.ejs`
2. `views/pages/profile/index.ejs`
3. `public/css/c2-c-wallet.css` — new isolated presentation layer
4. `src/release/static-assets.js` — registers only the new first-party CSS with the existing fail-closed versioning helper
5. `test/c2-c-wallet-semantics.test.js` — new deterministic semantic and asset-registration contract
6. `docs/C2_C_WALLET_SEMANTIC_REDESIGN.md` — this implementation/evidence record

No other file is in scope.

## 5. Explicitly frozen behavior and source areas

C2-C must leave the following behavior unchanged:

- exact wallet calculation;
- exact Hive RPC/read behavior;
- exact HP milestone thresholds and progress calculation;
- profile ownership derivation;
- reward-claim availability gate;
- reward preflight and exact-operation construction;
- browser-side Hive Keychain authority;
- authentication and verified-session identity;
- origin/CSRF protections;
- duplicate/fingerprint protections;
- cancellation semantics;
- bounded operation observation and no automatic retry;
- payment and Distriator state;
- onboarding state;
- controlled/delegated state;
- production environment and infrastructure;
- dormant V1 state;
- the accepted 12-action beta manifest.

In particular, these files are not modified by the candidate:

- `src/hive/wallet.js`
- `src/hive/milestones.js`
- `src/hive/read-service.js`
- `routes/profile.js`
- `public/js/m4-actions.js`
- `src/hive/m4-operations.js`
- all payment routes, controllers, observers, receipt storage, and deployment helpers
- all onboarding implementation files
- all Privex/production configuration and operations files

The single change in `src/release/static-assets.js` is presentation plumbing only: it adds `/css/c2-c-wallet.css` to the existing immutable first-party asset registry. The versioning algorithm, hashing behavior, fail-closed lookup behavior, and every pre-existing asset entry remain unchanged.

The Git compare against the exact parent is the authoritative proof of changed-file scope.

## 6. Presentation architecture

C2-C adds one profile-local stylesheet:

`public/css/c2-c-wallet.css`

It is loaded after the accepted profile presentation layers and is limited to `.c2c-wallet*` selectors plus descendants of the C2-C wallet root.

The stylesheet:

- uses existing `--hb-*` design tokens;
- contains no external font, image, script, network dependency, `url(...)`, or `@import`;
- does not alter Pay presentation;
- does not add JavaScript;
- does not alter the common global `<head>`.

The stylesheet is registered with the existing first-party asset-versioning mechanism so every profile route can render through the same fail-closed `assetUrl(...)` contract already used by other accepted scoped stylesheets.

## 7. Deterministic C2-C contract

`test/c2-c-wallet-semantics.test.js` verifies that:

- the Wallet renders the C2-C surface marker;
- patron-facing terms precede their exact Hive protocol labels;
- the existing bar milestone remains rendered;
- the existing FAQ Wallet section is linked;
- the public/read-only and private-key safety language remains present;
- public viewers do not receive the reward-claim form;
- the template remains bound directly to the accepted wallet values;
- the exact existing reward-claim gate remains present;
- no invented send/transfer/swap/buy/sell/fiat/portfolio capability is introduced;
- the C2-C stylesheet is loaded and registered with first-party asset versioning;
- the C2-C stylesheet is local and token-driven.

Existing `test/wallet.test.js` remains authoritative for the exact calculation values and milestone thresholds.

Existing M15.4 tests remain authoritative for public-wallet and owner reward-claim behavior.

## 8. First qualification correction

The first candidate preserved all wallet semantic tests but exposed one real presentation-integration omission in the existing M18.2 fixture:

- profile pages referenced `/css/c2-c-wallet.css` through `assetUrl(...)`;
- the new stylesheet had not yet been added to `FIRST_PARTY_ASSETS`;
- the fail-closed versioning helper therefore rejected the unknown asset and authenticated profile rendering returned HTTP 500;
- 401 of 402 deterministic tests passed, including all new C2-C semantic tests;
- the failure occurred before cumulative visual qualification.

The correction does not weaken the fixture or asset helper. It registers exactly the new stylesheet, adds a deterministic assertion for that registration, updates this declared scope from five files to six, and rewrites the feature branch back to one clean direct-child candidate rooted at the same authorized parent.

No workflow, fixture, release gate, operation controller, wallet calculation, or test expectation is weakened.

## 9. Cumulative qualification

The existing CI workflow remains unchanged and is authoritative.

On pull request, it runs:

- deterministic verification on pinned Node/npm for Ubuntu and Windows;
- the complete repository test suite;
- release/security/coherence checks;
- cumulative M18.2 visual acceptance;
- cumulative M18.3 visual acceptance;
- cumulative M18.4 patron-surface visual acceptance, including Wallet capture at 390, 768, and 1440 pixels with non-GET mutations blocked and Keychain disabled;
- the existing UX visual chain after those cumulative gates.

No workflow weakening or visual-harness exception is authorized for C2-C.

## 10. Source acceptance gate

C2-C source qualification requires all of the following:

1. exact parent `e0d17a8edb8ce893983c68729d195ea2ac419153`;
2. direct-child candidate with exactly one commit ahead and zero behind the authorized parent;
3. exactly the six declared changed files;
4. no wallet calculation/read-service/milestone/operation/payment/authority/onboarding/infrastructure/V1 changes;
5. the static-asset registry change is limited to registering `/css/c2-c-wallet.css`;
6. deterministic Ubuntu pass;
7. deterministic Windows pass;
8. all existing tests remain green;
9. cumulative visual acceptance remains green, including the Wallet viewport captures;
10. no live Hive write;
11. no Keychain request;
12. no payment or Distriator mutation;
13. no onboarding or controlled/delegated activation;
14. no production or DNS/Cloudflare mutation.

After source qualification, stop for owner review and explicit integration authorization.

## 11. Non-goals

C2-C does not:

- redesign Pay;
- add token transfer controls;
- add fiat values or market prices;
- add portfolio accounting;
- modify Hive economic semantics;
- modify voting or RC calculations;
- change reward claim operations;
- activate payments, onboarding, controlled posting, delegated posting, or V1;
- perform general site-wide copy polish;
- implement the later C2-D media pipeline.
