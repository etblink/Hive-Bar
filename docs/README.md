# Hive-Bar Documentation Index

This index separates **living documentation** from **historical milestone evidence**.

## Living documentation

- `../README.md` — current product/developer entry point.
- `ROADMAP.md` — the only living current/next milestone roadmap.
- `PRODUCTION_OPERATIONS.md` — current production operating model and release boundary.
- `../.env.example` and `../ops/privex/hive-bar.env.example` — current configuration examples.
- `../ops/privex/manifest.json` — machine-readable reviewed production architecture and allowed release profiles.

Living documentation must be updated when its factual claims become stale.

## Current accepted source and production state

Canonical `main` and production are aligned on accepted M19.1 commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`, tree `1a4bb993ad59ca67032997d8938696a079a71e1f`. M19.2 deployed that exact source under the accepted beta self-signing runtime and preserved exact M17.3 as `/opt/hive-bar/last-good`. V1, Pay, and Distriator remain inactive. M19.3 in-person Hive onboarding is the current source-only milestone and is not yet production-activated.

## Accepted M17 release-governance record

- `M17_1_V1_PRODUCT_BOUNDARY.md` — accepted V1 functional boundary.
- `M17_2_SOURCE_OF_TRUTH_AND_V1_GATE.md` — accepted source-of-truth and V1-gate reconciliation record.
- `M17_3_RUNTIME_V1_WIRING_AND_OPERATIONAL_ACCEPTANCE.md` — accepted runtime V1 wiring and operational-acceptance record.
- `M17_4_FUNCTIONAL_V1_BASELINE.md` — accepted pre-final functional V1 baseline qualification record.

## Accepted M18 historical evidence

M18 milestone files, tests, CI runs, and visual evidence preserve the accepted visual/user-experience work through M18.4. They are historical evidence, not a substitute for the living current-state statements above.

## M19 records

- `M19_1_COPY_AND_ONBOARDING_READINESS.md` — accepted copy/onboarding-readiness source boundary preceding controlled beta deployment.
- `M19_3_IN_PERSON_HIVE_ONBOARDING.md` — current source qualification boundary for customer credential generation, one-time bartender QR handoff, claimed-account creation, starter HP delegation, and no-auto-retry observation.

M19.2 is an accepted production deployment event recorded in the living roadmap and production operations document rather than a source implementation file.

## Historical milestone records

Files named for M1 onward are preserved as contemporaneous specifications, runbooks, or evidence. They may accurately say that a then-future action was unexecuted, write-disabled, incomplete, or separately authorized. Do not rewrite those historical facts merely to make them sound current.

When a historical runbook conflicts with `PRODUCTION_OPERATIONS.md`, the current operations document governs present procedure unless a newer accepted milestone explicitly supersedes it.
