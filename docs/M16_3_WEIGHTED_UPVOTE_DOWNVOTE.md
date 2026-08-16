# M16.3 — Weighted upvote/downvote support

## Status

Source-only candidate. Production remains unchanged and write-disabled until a separate activation authorization is given.

## Purpose

M16.3 extends the accepted M16.2 authenticated self-signing beta lane with one additional Posting-authority capability: explicit weighted voting on posts and comments.

A verified Hive session remains both the voter identity and the Keychain signer. Hive-Bar never accepts a caller-supplied voter identity and never receives a private key.

## User-visible voting model

Every enabled vote surface presents two explicit choices:

- direction: `Upvote` or `Downvote`;
- weight: a whole-number percentage from 1% through 100%.

The form never asks a user to encode a downvote by entering a negative percentage. Direction and magnitude are separate, visible inputs.

Before Keychain opens, the accepted exact-review pipeline displays the operation summary, exact Hive operation, authority, signer, and operation fingerprint.

## Hive operation mapping

The UI percentage is converted to Hive vote weight as follows:

```text
upvote:   +percent * 100
downvote: -percent * 100
```

Examples:

```text
42% upvote   -> weight  4200
37% downvote -> weight -3700
100% upvote  -> weight 10000
100% downvote-> weight -10000
```

The server validates that the percentage is an integer from 1 through 100 and that direction is exactly `upvote` or `downvote`.

For compatibility with the pre-M16.3 controlled API, an omitted direction still means `upvote`. The M16.3 browser UI always sends direction explicitly.

## Beta authorization boundary

The accepted M16.2 base configuration remains the foundation for self-signed `post` and `comment` operations. M16.3 adds `vote` as a narrowly source-bound beta extension in the social route and vote surface.

M16.3 does not enable:

- Threads creation;
- follow/unfollow;
- community subscribe/unsubscribe;
- profile changes;
- reward claims;
- public wall transfers;
- encrypted inbox transfers;
- Pay or Distriator;
- any Active-authority beta operation;
- any delegated or server-held signing key.

M4 and payment routes remain behind the existing controlled-write middleware and therefore continue to fail closed in beta mode.

## Identity and safety invariants

For every beta vote:

1. a verified Hive session is required;
2. same-origin and CSRF checks remain required;
3. the voter is forced to the verified session account;
4. the target author and permlink are server-validated;
5. direction and percentage are server-validated;
6. the exact operation and SHA-256 fingerprint are prepared before Keychain;
7. the user must explicitly approve the review;
8. Keychain signs with Posting authority only;
9. accepted broadcasts are observed through bounded Hive RPC checks;
10. an accepted-but-unconfirmed broadcast is never retried automatically.

The existing Hive observation logic compares the on-chain vote percentage against the exact signed operation weight and already supports both positive and negative weights.

## Regression requirements

The M16.3 candidate must prove:

- exact positive and negative Hive vote golden vectors;
- 1–100 whole-number magnitude validation;
- invalid direction rejection;
- legacy omitted-direction behavior remains an upvote;
- arbitrary caller-supplied voter fields cannot override the verified session account;
- beta preflight produces exact weighted upvote and downvote operations;
- post and comment vote forms expose explicit direction and magnitude controls;
- beta vote forms use the Keychain signer handoff;
- M4 Active-authority actions remain unavailable in beta mode;
- the accepted M16.2 posting/reply behavior and controlled-mode suites continue to pass.

## Explicitly deferred

M16.3 does not add a zero-weight `unvote` control. If removal of an existing vote is desired for beta, it should be considered explicitly rather than hidden behind a 0% convention.

M16.4 remains reserved for public wall and encrypted private-message beta enablement.

## Production boundary

This candidate changes repository source only. It does not modify the production environment, restart the service, invoke Keychain, broadcast to Hive, activate payments, change Cloudflare/DNS/Caddy/systemd, integrate the target branch, or touch PR #1.
