# Hive-Bar Living Roadmap

This is the only living document that defines the current and next project milestones. Historical milestone files preserve prior decisions but do not redefine this roadmap.

## Current state

- Production: accepted M16.8 beta on `fourthstreetbar.com`.
- Accepted beta writes: post, comment, weighted vote, Wall, encrypted Inbox.
- Payments/Distriator: disabled.
- Controlled/operator/delegated lanes: inert.
- Current source-of-truth work: M17.2 source-only reconciliation.

## M17 — Beta closeout and functional V1 readiness

### M17.1 — V1 product boundary

**Accepted.** Freeze the deterministic patron-facing V1 scope and preserve payments/operator/delegated functions as separate lanes.

### M17.2 — Source of truth and V1 gate

**Current.** Reconcile living documentation, canonical V1 action identity, release version identity, Privex release architecture, CI immutability, and a dormant fail-closed V1 gate. No production activation.

### M17.3 — Runtime V1 wiring and operational acceptance

After M17.2 acceptance, wire the frozen V1 action manifest into explicit production self-signing runtime dispatch, rehearse the V1 gate without unintended Hive writes, reconcile liveness/monitoring behavior, and perform bounded browser/device acceptance.

### M17.4 — Functional V1 baseline

Create one exact candidate, pass Ubuntu/Windows CI and all release checks, then reconcile the accepted lineage to `main` by exact fast-forward. Retire stale development governance artifacts only after acceptance.

## M18 — Cosmetic and user-experience elevation

After deterministic V1 functionality is frozen, improve visual identity, navigation, hierarchy, typography, spacing, responsive behavior, onboarding, empty states, composers, profile presentation, Wall/Inbox presentation, and interaction feedback without changing accepted Hive transaction semantics.

## Final V1 release

After M18 acceptance, synchronize package/app identity to `1.0.0`, qualify and deploy one exact final candidate, activate the accepted V1 profile under separate authorization, verify production, then create the first `v1.0.0` Git tag/release.

## Deferred/separate lanes

- Pay Tab genuine-purchase activation;
- Distriator;
- controlled bar-operator posting;
- delegated staff posting;
- reward claiming;
- additional wallet operations;
- future multi-venue/brand productization and resale architecture.
