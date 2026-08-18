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

Canonical `main` is the accepted M18.3 source at commit `524732a18559858bf20d2976cb5b791d6eaa36c8`, tree `ea2c5742f65669f8e5842fc2b357da821e893325`. Production remains on the accepted M17.3 deployed source with the beta self-signing runtime; accepted M18.3 source has not been deployed. The next source milestone is M18.4 beta-readiness closure and final targeted qualification before a separately authorized controlled beta deployment.

The live `/opt/hive-bar/last-good` pointer remains governed by `PRODUCTION_OPERATIONS.md`; this documentation update does not alter host state.

## Accepted M17 release-governance record

- `M17_1_V1_PRODUCT_BOUNDARY.md` — accepted V1 functional boundary.
- `M17_2_SOURCE_OF_TRUTH_AND_V1_GATE.md` — accepted source-of-truth and V1-gate reconciliation record.
- `M17_3_RUNTIME_V1_WIRING_AND_OPERATIONAL_ACCEPTANCE.md` — accepted runtime V1 wiring and operational-acceptance record.
- `M17_4_FUNCTIONAL_V1_BASELINE.md` — accepted pre-final functional V1 baseline qualification record.

## Accepted M18 historical evidence

M18 milestone files and tests preserve the accepted visual/user-experience work through M18.3. They are historical evidence, not a substitute for the living current-state statements above.

## Historical milestone records

Files named for M1 onward are preserved as contemporaneous specifications, runbooks, or evidence. They may accurately say that a then-future action was unexecuted, write-disabled, incomplete, or separately authorized. Do not rewrite those historical facts merely to make them sound current.

When a historical runbook conflicts with `PRODUCTION_OPERATIONS.md`, the current operations document governs present procedure unless a newer accepted milestone explicitly supersedes it.
