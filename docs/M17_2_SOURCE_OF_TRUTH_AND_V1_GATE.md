# M17.2 Source of Truth and V1 Gate

Status: **source-only candidate** rooted at accepted M16.8. No production activation is authorized by this document.

## Purpose

M17.2 reconciles the living source of truth before V1 functional acceptance. It introduces a canonical V1 action manifest, a dormant fail-closed Privex V1 release gate, package-derived application version identity, release/documentation coherence checks, current documentation, and immutable CI action pins.

## Source-of-truth policy

Historical milestone specifications and evidence remain immutable snapshots. Living documents are limited to the root `README.md`, `docs/README.md`, `docs/ROADMAP.md`, `docs/PRODUCTION_OPERATIONS.md`, environment examples, release manifests, CI configuration, and current operational code/comments.

No living document may claim an obsolete milestone as current or imply that a historical read-only runbook describes the accepted beta/V1 state.

## V1 action manifest

`src/v1/actions.js` is the canonical source for the V1 self-signing action set.

Posting authority:

- post
- thread
- comment
- vote
- follow
- unfollow
- subscribe
- unsubscribe
- profile

Active authority:

- wall
- inbox

Reward claiming, Pay Tab, Distriator, controlled/operator posting, delegated posting, and other wallet actions are excluded.

## Dormant V1 gate

`src/release/v1-readiness.js` defines `privex-v1-self-signing`. The gate requires the reviewed Privex topology, `production` write mode, local Keychain signing, empty controlled lanes, the exact package-derived application tag, disabled payments/Distriator, at least three RPC nodes, and no M9/M10/M12 state.

M17.2 intentionally does **not** remove the existing `src/config.js` production-write refusal or route runtime production through the V1 action set. `scripts/check-v1-release.js` therefore validates a proposed V1 environment without starting the application. Actual runtime wiring and rehearsal belong to M17.3 and require separate acceptance.

## Version identity

`src/release/release-version.js` derives `fourth-street-bar-app/<package-version>` from `package.json`. M17 keeps version `0.1.0`; the synchronized `1.0.0` package/app/tag identity is deferred until cosmetic M18 is complete and final V1 release is ready.

## Branch governance design

The accepted development lineage is intended to remain on `codex/m6-read-only-release-readiness` through M17.3. M17.4 should fast-forward `main` exactly to the accepted functional V1 baseline, then close the stale M2 PR #1 as superseded and retire the temporary long-lived development branch. No merge, squash, rebase, or history rewrite is required because the accepted lineage descends from current `main`.

## Licensing decision

No open-source license is added. The root README explicitly states that no open-source license is granted and all rights are reserved. This supports future venue/brand commercialization without silently granting reuse rights.

## M17.2 acceptance criteria

- candidate descends exactly from accepted M16.8;
- V1 action manifest is singular and deterministic;
- dormant V1 gate fails closed on topology, signing, controlled-lane, payment, or version drift;
- package/app/manifest/env version identity is mechanically coherent;
- README and living docs describe current reality;
- no historical milestone evidence is rewritten;
- CI third-party actions are pinned by immutable commit SHA;
- production, Hive, Keychain, Pay/Distriator, Cloudflare/DNS/Caddy, `main`, and PR #1 remain untouched during qualification;
- Ubuntu and Windows deterministic gates pass.
