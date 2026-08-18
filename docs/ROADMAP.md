# Hive-Bar Living Roadmap

This is the only living document that defines the current and next project milestones. Historical milestone files preserve prior decisions but do not redefine this roadmap.

## Current state

- Production source/operational wiring: accepted M17.3.
- Persistent production runtime: accepted beta self-signing profile.
- Accepted beta writes: post, comment, weighted vote, Wall, encrypted Inbox.
- V1 release gate: operationally rehearsed and accepted without persistent V1 activation.
- Payments/Distriator: disabled.
- Controlled/operator/delegated lanes: inert.
- Canonical repository source: accepted M18.3 commit `524732a18559858bf20d2976cb5b791d6eaa36c8`, tree `ea2c5742f65669f8e5842fc2b357da821e893325`.
- Accepted M18.3 source is not deployed; production remains M17.3.
- Next milestone: M18.4 beta-readiness closure and final targeted patron qualification.

## M17 — Beta closeout and functional V1 readiness

M17.1 through M17.4 are accepted historical milestones. They froze the V1 product boundary, reconciled source/release governance, rehearsed runtime V1 wiring without persistent activation, and established the functional V1 baseline while production remained beta.

## M18 — Cosmetic and user-experience elevation

### M18.1–M18.3

**Accepted in source.** The accepted M18 sequence modernized the application shell and patron experience, hardened deterministic visual qualification, and completed the Home, Wall, and Pay redesign through exact M18.3 without changing accepted transaction semantics.

### M18.4 — Beta-readiness closure

**Current.** Starting only from accepted M18.3, close the proven Followers/Following empty-state render defect; add empty/non-empty route and HTMX regressions; preserve pagination and existing read-only social-graph RPC semantics; add bounded read-only live social-graph qualification; replace patron-visible “byte limit” wording while preserving exact byte enforcement; distinguish sign-in-required follow copy from capability-unavailable copy; synchronize living documentation; and add a small targeted visual matrix for Followers, Following, Community/post composer, conversation/reply composer, Wallet, Inbox, and Settings.

M18.4 must retain fail-closed local visual networking, no RPC writes, disabled Keychain signing in visual qualification, Ubuntu/Windows deterministic verification, the accepted M18.2 visual regression, and the accepted M18.3 42-capture regression.

## Controlled beta deployment

After exact M18.4 source acceptance, deployment is a separate authorization. No source milestone implicitly deploys to production or activates V1.

## Final V1 release

After controlled beta feedback and explicit release approval, synchronize package/app identity to `1.0.0`, qualify and deploy one exact final candidate, activate the accepted V1 profile under separate authorization, verify production, then create the first `v1.0.0` Git tag/release.

## Deferred/separate lanes

- Pay Tab genuine-purchase activation;
- Distriator;
- controlled bar-operator posting;
- delegated staff posting;
- reward claiming;
- additional wallet operations;
- future multi-venue/brand productization and resale architecture.
