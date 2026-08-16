# M17.4 Functional V1 Baseline

Status: **source qualification candidate** rooted at accepted M17.3. This document defines the M17.4 acceptance boundary; it does not authorize `main` reconciliation, V1 production activation, package promotion to `1.0.0`, a Hive/Keychain write, or infrastructure mutation.

## Purpose

M17.4 freezes one exact pre-final functional V1 baseline after M17.3 proved that the reviewed production runtime can recognize the exact V1 self-signing profile without activating it persistently.

The baseline is intentionally functional rather than cosmetic. M18 remains responsible for visual and interaction elevation after deterministic behavior is frozen.

## Accepted M17.3 evidence entering this milestone

The production-safe M17.3 rehearsal established:

- deployed source commit `9409c8698e04c3b62f7361f29fc91f785ae7739b`;
- deployed source tree `435fea47c809b4ff46ffe7012cfd9e29a86f5f0b`;
- persistent production runtime restored to beta;
- accepted beta environment SHA-256 `831dfeac7523fc7484bb0c1d19c9c6060c8ff20ac4e20ce487a904c2f02bd4c2`;
- temporary V1 release-gate profile `privex-v1-self-signing`;
- exact V1 action manifest: `post`, `thread`, `comment`, `vote`, `follow`, `unfollow`, `subscribe`, `unsubscribe`, `profile`, `wall`, `inbox`;
- Pay disabled;
- Distriator disabled;
- controlled/delegated residue absent;
- no V1 service activation;
- no Hive write or Keychain request during the rehearsal;
- final public read-only edge checks and exact versioned browser-asset digest checks passed.

The installed M17.3 operational assets were also bound to these SHA-256 identities:

- `hive-bar-healthcheck`: `5abcbbc22e8b59a674d15e22a4efffa6714a8584558cfc65fa3dcb3d1f1d9fae`;
- `hive-bar-healthcheck.service`: `3cf16683100d6443dabf9e77848189c1a7520be10b1e57ccdaec8f9408d2f66a`;
- `hive-bar.service`: `88c6e21de5e1c42a0f6420cc5cec1cdc732f4bfb11450967bf392407dda49c80`.

## Functional baseline identity

M17.4 must preserve:

- package version `0.1.0`;
- Hive app tag `fourth-street-bar-app/0.1.0`;
- Node `24.19.0` and npm `11.17.0`;
- exact eleven-action V1 self-signing manifest;
- exact five-action beta manifest;
- Keychain as the local self-signing mechanism;
- review-before-Keychain behavior;
- no server private key or broadcast RPC path;
- no automatic rebroadcast after an accepted/ambiguous external action;
- Pay, Distriator, reward claiming, controlled operator posting, delegated posting, and other wallet operations outside the V1 baseline;
- production remaining beta until separately authorized.

No cosmetic redesign is required for M17.4 acceptance.

## Release bookkeeping hardening

The M17.3 post-failure audit found `/opt/hive-bar/last-good` unresolved. Explicit rollback remains exact-SHA and therefore did not depend on that pointer.

M17.4 fixes the **source** deployment helper so a future distinct exact deployment atomically sets `/opt/hive-bar/last-good` to the validated release that was current immediately before the source switch. The helper validates the prior release's commit/tree records against the reviewed bare repository before updating the pointer. A same-release deployment does not rewrite `last-good`.

The helper still deploys only while the read-only release gate is active. The source change does not itself repair the live host and does not authorize any host mutation during source qualification.

## Deterministic qualification

The candidate must pass the complete repository gate on both Ubuntu and Windows using the pinned runtime. In addition to existing checks, M17.4 adds a non-network `release:check:functional-v1` gate that refuses:

- a version/app-tag promotion before the final release milestone;
- any change to the exact V1 manifest;
- a manifest claim that V1 is already production-activated;
- loss of the accepted beta runtime profile;
- loss of exact `last-good` bookkeeping policy in the reviewed deployment source;
- stale living documentation that no longer identifies M17.4 as current.

## Repository canonicalization boundary

M17.4 source qualification occurs on a candidate branch based exactly on the accepted development lineage. Acceptance of the candidate does not itself move `main` or alter PR #1.

After exact candidate acceptance, a separate authorization may:

1. mark the M17.4 PR ready if still draft;
2. exact-fast-forward `codex/m6-read-only-release-readiness` to the accepted M17.4 head if not already integrated;
3. exact-fast-forward `main` to the same accepted functional baseline without merge, squash, or rebase;
4. retire PR #1 as superseded rather than merge it;
5. delete only the M17.4 candidate branch after all exact identities are reverified.

That canonicalization is not part of this source-qualification authorization.

## M17.4 acceptance criteria

- parent is exactly accepted M17.3;
- package/app identity remains `0.1.0`;
- exact V1 and beta action manifests remain unchanged;
- V1 production activation remains false;
- current production is accurately documented as M17.3 source with beta runtime;
- future `last-good` bookkeeping is deterministic and atomic in source;
- explicit rollback remains full-SHA and read-only gated;
- living documentation identifies M17.4 as current and M18 as next;
- all deterministic tests and release checks pass on Ubuntu and Windows;
- no production, Hive, Keychain, Pay/Distriator, Cloudflare, DNS, Caddy, host, `main`, or PR #1 mutation occurs during source qualification.
