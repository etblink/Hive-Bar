# Hive-Bar Living Roadmap

This is the only living document that defines the current and next project milestones. Historical milestone files preserve prior decisions but do not redefine this roadmap.

## Current state

- Production source/operational wiring: accepted M17.3.
- Persistent production runtime: accepted beta self-signing profile.
- Accepted beta writes: post, comment, weighted vote, Wall, encrypted Inbox.
- V1 release gate: operationally rehearsed and accepted without persistent V1 activation.
- Payments/Distriator: disabled.
- Controlled/operator/delegated lanes: inert.
- Canonical repository baseline: accepted M17.4 functional V1 baseline on `main` and the accepted development lineage.
- Production rollback bookkeeping: `/opt/hive-bar/last-good` reconciled to the exact currently deployed accepted M17.3 release; future distinct exact deployments update it atomically to the validated prior release.
- Next milestone: M18 cosmetic and user-experience elevation.

## M17 — Beta closeout and functional V1 readiness

### M17.1 — V1 product boundary

**Accepted.** Freeze the deterministic patron-facing V1 scope and preserve payments/operator/delegated functions as separate lanes.

### M17.2 — Source of truth and V1 gate

**Accepted.** Reconciled living documentation, canonical V1 action identity, release version identity, Privex release architecture, CI immutability, and the fail-closed V1 release gate without production activation.

### M17.3 — Runtime V1 wiring and operational acceptance

**Accepted.** Wired the frozen V1 action manifest into explicit production self-signing runtime dispatch, retained fail-closed direct-start behavior, installed profile-neutral liveness monitoring, deployed the accepted source through the read-only gate, rehearsed the real V1 gate only in a temporary process environment, and restored production to the accepted beta profile without a Hive or Keychain write.

### M17.4 — Functional V1 baseline

**Accepted.** Froze one exact pre-final functional V1 baseline from accepted M17.3, kept package/app identity at `0.1.0`, hardened future exact-deployment `last-good` bookkeeping in source, passed Ubuntu/Windows CI and all deterministic release checks, exact-fast-forwarded the accepted development lineage and canonical `main` to the same baseline, retired PR #1 as superseded without merge, and preserved production in beta. The existing host-side `last-good` gap was subsequently reconciled to the exact deployed M17.3 release without a service restart or source deployment.

## M18 — Cosmetic and user-experience elevation

**Next.** Audit and improve visual identity, navigation, hierarchy, typography, spacing, responsive behavior, onboarding, empty states, composers, profile presentation, Wall/Inbox presentation, and interaction feedback without changing accepted Hive transaction semantics, release boundaries, review-before-Keychain behavior, or no-auto-retry behavior.

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
