# Hive-Bar Living Roadmap

This is the only living document that defines the current and next project milestones. Historical milestone files preserve prior decisions but do not redefine this roadmap.

## Current state

- Last recorded accepted production transition: M19.2 deployed accepted M19.1 commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`, tree `1a4bb993ad59ca67032997d8938696a079a71e1f`.
- Runtime source identity: after R0 deployment, read the deployed `beta-<short-sha>` label and full commit/tree from `/healthz`; before that deployment, verify `/opt/hive-bar/current/.hive-bar-commit` and `.hive-bar-tree` operator-side rather than inferring from this document.
- Persistent production runtime: accepted beta self-signing profile.
- Canonical-source beta writes: post, comment, weighted vote, follow, unfollow, subscribe, unsubscribe, claim rewards, Wall, encrypted Inbox, Thread.
- Production rollback pointer: prior accepted M17.3 release remains the last recorded `/opt/hive-bar/last-good` boundary from M19.2; verify the live symlink before any operation.
- V1 release gate: operationally rehearsed and accepted without persistent V1 activation.
- Payments/Distriator: disabled.
- Controlled/operator/delegated lanes: inert.
- Canonical repository source: `main`; resolve its exact commit/tree from GitHub at qualification time rather than pinning this moving branch to a historical production event.
- In-person account creation: not activated; M19.3 remains the accepted source-only onboarding milestone.
- Product lifecycle: beta. Tester feedback and remediation continue until an explicit graduation decision; integrated V1-capable code does not itself make the product V1.

## M17 — Beta closeout and functional V1 readiness

M17.1 through M17.4 are accepted historical milestones. They froze the V1 product boundary, reconciled source/release governance, rehearsed runtime V1 wiring without persistent activation, and established the functional V1 baseline while production remained beta.

### M17.4 — Functional V1 baseline

**Accepted.** M17.4 established the exact pre-final functional V1 baseline, synchronized the accepted development lineage with canonical `main`, and preserved production on the accepted beta runtime without activating V1.

## M18 — Cosmetic and user-experience elevation

### M18.1–M18.3

**Accepted in source.** The accepted M18 sequence modernized the application shell and patron experience, hardened deterministic visual qualification, and completed the Home, Wall, and Pay redesign through exact M18.3 without changing accepted transaction semantics.

### M18.4 — Beta-readiness closure

**Accepted in source.** M18.4 closed the Followers/Following empty-state render defect; added route and HTMX regressions; preserved social-graph pagination/RPC semantics; added bounded live read-only Followers/Following qualification; completed patron-facing length feedback and follow-sign-in copy; synchronized living release governance; and added targeted patron visual coverage.

M18.4 was accepted and integrated on canonical `main` at commit `1aaef44c5b300810841f89044cf302aab789caf5`, tree `ece4e565a514f01879761f2d5467dc7cc5323773`.

## M19 — Closed beta launch

### M19.1 — Copy and onboarding readiness

**Accepted.** M19.1 completed the bounded patron-facing copy/onboarding pass, clarified Keychain and privacy boundaries, improved participation discoverability, humanized the 404 state, and synchronized living governance. It was accepted and integrated at commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`, tree `1a4bb993ad59ca67032997d8938696a079a71e1f`.

### M19.2 — Controlled beta deployment

**Accepted.** The exact accepted M19.1 source was deployed to `fourthstreetbar.com` through the read-only deployment gate and the previously accepted beta environment was restored byte-for-byte. Local health/readiness and public beta health passed; public first-party asset revisions matched the deployed release; the prior accepted M17.3 release remained the validated `last-good` rollback target. No V1 activation, Pay/Distriator activation, Keychain request, or Hive write was part of deployment.

### M19.3 — In-person Hive onboarding

**Current.** Build and qualify the real account-creation path that the first beta users should experience: choose a Hive username, generate/save recovery credentials entirely in the customer browser, create a short-lived opaque bartender QR, require the $5.00 cash onboarding fee before staff preparation, use an explicitly configured creator account with a pre-claimed account token, prepare one `create_claimed_account` plus fixed starter-HP `delegate_vesting_shares` transaction, obtain one Active-authority Keychain approval, and observe the exact created account/delegation without automatic retry.

M19.3 is source-only until separately accepted and integrated. It must not consume an account-creation token, create a Hive account, delegate HP, collect live tester cash, activate onboarding in production, deploy source, activate V1, or enable Pay/Distriator. A narrow legal review remains required before broad public commercialization of the paid onboarding flow.

### M19.4 — Real closed beta

**Planned.** Expand beta testing deliberately after the earliest independent testers and remediation cycles demonstrate that the next cohort can participate productively. Preserve build provenance for each report, collect where people hesitate or fail, and continue iterative remediation before broader customer exposure.

### M19.5 — Beta triage and release decision

**Planned.** Classify findings as beta blockers, material pre-V1 usability problems, or later enhancements. Continue bounded remediation and cohort expansion until the product is demonstrably working. Only then make an explicit V1 graduation decision; do not infer V1 status from the existence of V1-capable source code.

## Final V1 release

After controlled beta feedback and explicit release approval, synchronize package/app identity to `1.0.0`, qualify and deploy one exact final candidate, activate the accepted V1 profile under separate authorization, verify production, then create the first `v1.0.0` Git tag/release.

## Deferred/separate lanes

- Pay Tab genuine-purchase activation;
- Distriator;
- controlled bar-operator posting;
- delegated staff posting;
- additional wallet operations beyond the accepted beta/V1 manifests;
- future dedicated onboarding creator/recovery-account operationalization;
- future multi-venue/brand productization and resale architecture.
