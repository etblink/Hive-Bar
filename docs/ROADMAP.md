# Hive-Bar Living Roadmap

This is the only living document that defines the current and next project milestones. Historical milestone files preserve prior decisions but do not redefine this roadmap.

## Current state

- Production source/operational wiring: accepted M17.3.
- Persistent production runtime: accepted beta self-signing profile.
- Accepted beta writes: post, comment, weighted vote, Wall, encrypted Inbox.
- V1 release gate: operationally rehearsed and accepted without persistent V1 activation.
- Payments/Distriator: disabled.
- Controlled/operator/delegated lanes: inert.
- Current source-of-truth work: M17.4 functional V1 baseline.

## M17 — Beta closeout and functional V1 readiness

### M17.1 — V1 product boundary

**Accepted.** Freeze the deterministic patron-facing V1 scope and preserve payments/operator/delegated functions as separate lanes.

### M17.2 — Source of truth and V1 gate

**Accepted.** Reconciled living documentation, canonical V1 action identity, release version identity, Privex release architecture, CI immutability, and the fail-closed V1 release gate without production activation.

### M17.3 — Runtime V1 wiring and operational acceptance

**Accepted.** Wired the frozen V1 action manifest into explicit production self-signing runtime dispatch, retained fail-closed direct-start behavior, installed profile-neutral liveness monitoring, deployed the accepted source through the read-only gate, rehearsed the real V1 gate only in a temporary process environment, and restored production to the accepted beta profile without a Hive or Keychain write.

### M17.4 — Functional V1 baseline

**Current.** Freeze one exact pre-final functional V1 baseline from accepted M17.3, keep package/app identity at `0.1.0`, repair future exact-deployment `last-good` bookkeeping in source, pass Ubuntu/Windows CI and all deterministic release checks, and preserve production in beta. After acceptance, canonical `main` reconciliation and stale PR #1 retirement require a separate exact-fast-forward authorization.

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
