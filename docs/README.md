# Hive-Bar Documentation Index

This index separates **living documentation** from **historical milestone evidence**.

## Living documentation

- `../README.md` — current product/developer entry point.
- `ROADMAP.md` — the only living current/next milestone roadmap.
- `PRODUCTION_OPERATIONS.md` — current production operating model and release boundary.
- `../.env.example` and `../ops/privex/hive-bar.env.example` — current configuration examples.
- `../ops/privex/manifest.json` — machine-readable reviewed production architecture and allowed release profiles.

Living documentation must be updated when its factual claims become stale.

## Accepted M17 release-governance record

- `M17_1_V1_PRODUCT_BOUNDARY.md` — accepted V1 functional boundary.
- `M17_2_SOURCE_OF_TRUTH_AND_V1_GATE.md` — accepted source-of-truth and V1-gate reconciliation record.
- `M17_3_RUNTIME_V1_WIRING_AND_OPERATIONAL_ACCEPTANCE.md` — accepted runtime V1 wiring and operational-acceptance record.
- `M17_4_FUNCTIONAL_V1_BASELINE.md` — accepted pre-final functional V1 baseline qualification record.

M17 is complete. Production remains on the accepted M17.3 deployed source with the beta self-signing runtime. The live `/opt/hive-bar/last-good` pointer remains reconciled to that exact deployed release; present operating procedure is defined in `PRODUCTION_OPERATIONS.md`.

## M18 user-experience state

M18.3 is accepted and canonical in the repository at commit `524732a18559858bf20d2976cb5b791d6eaa36c8` / tree `ea2c5742f65669f8e5842fc2b357da821e893325`. That source has not been deployed to production.

- `M18_4_BETA_READINESS_CLOSURE.md` — current source-qualification specification for the bounded pre-beta closure lane.

M18.4 does not itself authorize integration, production deployment, V1 activation, Hive writes, Keychain requests, Pay/Distriator activation, or infrastructure mutation.

## Historical milestone records

Files named for M1 through M17 are preserved as contemporaneous specifications, runbooks, or evidence. They may accurately say that a then-future action was unexecuted, write-disabled, incomplete, or separately authorized. Do not rewrite those historical facts merely to make them sound current.

When a historical runbook conflicts with `PRODUCTION_OPERATIONS.md`, the current operations document governs present procedure unless a newer accepted milestone explicitly supersedes it.
