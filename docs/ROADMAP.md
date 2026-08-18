# Hive-Bar Living Roadmap

This is the only living document that defines the current and next project milestones. Historical milestone files preserve prior decisions but do not redefine this roadmap.

## Current state

- Production source/operational wiring: accepted M17.3.
- Persistent production runtime: accepted beta self-signing profile.
- Accepted beta writes: post, comment, weighted vote, Wall, encrypted Inbox.
- V1 release gate: operationally rehearsed and accepted without persistent V1 activation.
- Payments/Distriator: disabled.
- Controlled/operator/delegated lanes: inert.
- Canonical repository source: accepted M18.4 commit `1aaef44c5b300810841f89044cf302aab789caf5`, tree `ece4e565a514f01879761f2d5467dc7cc5323773`.
- Accepted M18.4 source is not deployed; production remains M17.3.
- Current milestone: M19.1 copy and onboarding readiness for controlled beta launch.

## M17 — Beta closeout and functional V1 readiness

M17.1 through M17.4 are accepted historical milestones. They froze the V1 product boundary, reconciled source/release governance, rehearsed runtime V1 wiring without persistent activation, and established the functional V1 baseline while production remained beta.

### M17.4 — Functional V1 baseline

**Accepted.** M17.4 established the exact pre-final functional V1 baseline, synchronized the accepted development lineage with canonical `main`, and preserved production on the accepted beta runtime without activating V1.

## M18 — Cosmetic and user-experience elevation

### M18.1–M18.3

**Accepted in source.** The accepted M18 sequence modernized the application shell and patron experience, hardened deterministic visual qualification, and completed the Home, Wall, and Pay redesign through exact M18.3 without changing accepted transaction semantics.

### M18.4 — Beta-readiness closure

**Accepted in source.** M18.4 closed the Followers/Following empty-state render defect; added route and HTMX regressions; preserved social-graph pagination/RPC semantics; added bounded live read-only Followers/Following qualification; completed patron-facing length feedback and follow-sign-in copy; synchronized living release governance; and added targeted patron visual coverage for Followers, Following, Community/post composer, conversation/reply composer, Wallet, Inbox, and Settings.

M18.4 retained fail-closed local visual networking, no RPC writes, disabled Keychain signing in visual qualification, Ubuntu/Windows deterministic verification, the accepted M18.2 visual regression, and the accepted M18.3 42-capture regression. It was accepted and integrated on canonical `main` at commit `1aaef44c5b300810841f89044cf302aab789caf5`, tree `ece4e565a514f01879761f2d5467dc7cc5323773`, without deployment.

## M19 — Closed beta launch

### M19.1 — Copy and onboarding readiness

**Current.** Perform one bounded patron-facing prose and onboarding pass before deployment: preserve the established 4th Street Bar voice; clarify sign-in and Keychain expectations; make participation choices discoverable without turning pages into manuals; state privacy/public-data boundaries accurately; replace implementation-shaped patron error language; synchronize living source/production governance; and add focused deterministic copy regressions.

M19.1 is source-only. It must not expand capabilities, change transaction semantics, deploy source, activate V1, enable Pay/Distriator, alter infrastructure, or perform any Hive/Keychain write.

### M19.2 — Controlled beta deployment

**Planned.** Deploy one exact accepted beta candidate to `fourthstreetbar.com` under the already accepted beta self-signing runtime. Preserve exact commit/tree identity, read-only deployment gating, rollback evidence, and only a minimal production sanity check: canonical site availability, anonymous rendering, Keychain sign-in, authenticated UI visibility, obvious browser/server error absence, and exact deployed identity. Do not repeat the already established full transaction demonstration solely for ceremony.

### M19.3 — Real closed beta

**Planned.** Invite a small real-user cohort, initially about 5–10 people, with lightweight guidance rather than a scripted acceptance test. Collect where people hesitate, misunderstand, fail to find a capability, encounter mobile/Keychain friction, or experience a genuine defect.

### M19.4 — Beta triage and release decision

**Planned.** Classify findings as release blockers, pre-V1 UX issues, or post-V1 enhancements. Fix only demonstrated blockers and material pre-V1 usability problems. If the closed beta exposes no material release blocker, freeze the result and proceed to the final V1 release sequence rather than creating additional polish milestones by default.

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
