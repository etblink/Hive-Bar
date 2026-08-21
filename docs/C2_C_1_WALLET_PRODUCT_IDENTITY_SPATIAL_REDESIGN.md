# C2-C.1 — Wallet Product Identity + Spatial Redesign

## Status

Source-only C2-C.1 presentation candidate. Integration and production deployment remain separately authorized boundaries.

## Exact authorized baseline

- `main` commit: `5833a58c799f245eb80b416a18776a57498feb32`
- tree: `32399191aa9f947f4edff5603147247bf3c15fe0`
- accepted production build at authorization: `beta-5833a58`

C2-C.1 is presentation and information architecture only. The C2-C semantic contract remains authoritative.

## Product objective

The Wallet should read as a Fourth Street Bar patron-status surface first, a participation surface second, and a Hive wallet third.

The intended hierarchy remains:

1. bar status / patron identity;
2. participation state;
3. balances;
4. rewards;
5. inspectable technical/help material.

Exact Hive values and terminology remain available and unchanged.

## Human-review evidence

The first fully deterministic C2-C.1 candidate was:

- commit `e7583d3995dcc9dddd8fc0fa7c9155110555ed24`
- tree `13a9ff03fe02550888caee184a7435705dd13fd0`
- CI #244: PASS
- UX-1E #100: PASS

The preserved M18.4 visual artifact was downloaded and reviewed by Tester #0 with supplied SHA-256:

`712918c042f53ec08b0d8d3b7b84566c5de0f37df3c5a35128c89cb9f111a06d`

The 1440, 768, and 390 Wallet captures were rejected for product/presentation acceptance even though the automated contracts passed.

Observed human-review failures:

- the inherited pitcher still read visually like a large battery/fuel gauge rather than an unmistakable beer pitcher;
- the pitcher dominated the participation region instead of functioning as a compact signature mechanic;
- the 720px two-column participation breakpoint produced an awkward tablet composition;
- the 390px composition crowded the pitcher and voting copy;
- the fixed bottom navigation crossed the full-page Wallet capture while participation content occupied that vertical region;
- the bar-level hero retained unexplained decorative geometry rather than reading as a coherent patron-status object;
- Activity capacity remained too close to a telemetry panel because the exact RC percentage and meter competed with the human readiness state;
- the milestone progress label/value separated awkwardly on narrow screens.

Therefore the first C2-C.1 candidate was not recommended for integration.

## Human-review remediation

The remediated source direction preserves the same semantic hierarchy while changing the spatial grammar.

### Bar status

- Keep `Your bar level` as the patron-facing semantic anchor.
- Keep the exact existing milestone name, icon, HP amount, threshold, and progress calculation.
- Replace the decorative circular ornament with a compact bar-level badge/plaque.
- Reduce hero scale so the level reads as identity rather than oversized dashboard typography.
- Keep milestone progress as one coherent label/value row on narrow viewports.

### Voting strength / pitcher

- Preserve the exact `wallet.votingPowerPercent` and `wallet.beerSegmentsFilled` bindings.
- Preserve `Voting strength` before secondary `Voting power`.
- Recast the inherited pitcher styling as a compact glass vessel with an explicit handle, foam line, contiguous amber fill, and no scale transform or battery-like segment gaps.
- Keep the pitcher and its copy in a bounded responsive grid at small widths.

### Activity capacity

- Preserve the exact `wallet.resourceCreditsPercent` binding.
- Keep the human readiness state (`Plenty of room`, `Room to participate`, `Running low`, `Refilling`) primary.
- Replace the large generic RC meter with five presentation-only capacity marks.
- Keep the exact percentage and `Resource credits (RC)` inspectable in a native disclosure.
- The capacity marks and readiness labels are presentation only; they do not gate, predict, or modify Hive operations.

### Responsive composition

- Keep participation single-column through tablet widths.
- Enter the two-column participation layout only at `960px` and above.
- Provide additional Wallet bottom clearance below `1200px`, where the application uses fixed bottom navigation.
- Cap the pitcher to a compact fixed visual size and reduce it again below `640px`.
- Preserve the existing historical balance-grid source classes required by cumulative deterministic coverage.

## Exact changed-file scope

1. `views/pages/profile/partials/user-wallet.ejs`
2. `public/css/c2-c-wallet.css`
3. `test/c2-c1-wallet-product-identity.test.js`
4. `docs/C2_C_1_WALLET_PRODUCT_IDENTITY_SPATIAL_REDESIGN.md`

No other file is part of C2-C.1.

## Deterministic contracts

C2-C.1 must continue to prove:

- status precedes participation, which precedes balances, which precedes rewards;
- `Your bar level`, `Voting strength`, `Activity capacity`, exact balance labels, and reward semantics remain present;
- `Liquid HBD`, `Liquid HIVE`, `Hive Power`, `Voting power`, `Resource credits (RC)`, and `Claimable rewards` remain inspectable;
- all exact wallet value expressions remain directly bound;
- the beer-pitcher lineage remains bound to `wallet.beerSegmentsFilled`;
- owner reward claim retains the exact existing gate and pre-Keychain reread copy;
- no send/transfer/swap/buy/sell/portfolio capability is introduced;
- public-data/private-key/Keychain disclosure and `/faq#wallet` remain present;
- the pitcher is compact, unscaled, handled, and free of the rejected decorative battery treatment;
- two-column participation does not begin before `960px`;
- sub-1200px Wallet content receives explicit bottom clearance for fixed navigation;
- narrow milestone progress remains a coherent two-column label/value row;
- Activity capacity state remains primary while exact RC is inspectable;
- CSS remains local, scoped, token-driven, and free of remote assets.

## Frozen boundaries

The following remain unchanged and outside C2-C.1:

- `src/hive/wallet.js`
- `src/hive/milestones.js`
- `src/hive/read-service.js`
- `routes/profile.js`
- `public/js/m4-actions.js`
- `src/hive/m4-operations.js`
- all wallet calculations and Hive RPC/read behavior
- milestone thresholds and progression rules
- profile ownership derivation
- reward-claim preflight and operation construction
- authentication and verified-session identity
- origin/CSRF protections
- duplicate/fingerprint protections
- cancellation and bounded-observation/no-auto-retry behavior
- Keychain/browser signer authority
- exact 12-action beta manifest
- payment/Distriator state
- onboarding state
- controlled/delegated state
- production environment and infrastructure
- DNS/Cloudflare state
- dormant V1 state

## Qualification policy

The feature branch must be rewritten to one clean direct-child commit of the exact authorized baseline after remediation. Fresh deterministic and cumulative visual qualification on that exact final SHA is authoritative.

A green automated visual harness is necessary but not sufficient for product acceptance. The preserved 1440, 768, and 390 Wallet screenshots must be manually reviewed before integration is recommended.

No live Hive write, Keychain request, production deployment, payment mutation, onboarding activation, controlled/delegated mutation, infrastructure/DNS change, or V1 activation is authorized by C2-C.1 source work.
