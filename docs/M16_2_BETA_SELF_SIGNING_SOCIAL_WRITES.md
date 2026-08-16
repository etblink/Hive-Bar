# M16.2 — Beta self-signing social writes

## Status

Source-only candidate. Production remains unchanged until a separate deployment authorization is given.

## Purpose

M16.2 introduces an explicit beta authorization lane for ordinary verified Hive users without weakening the existing controlled bar-operator lane.

The beta rule is deliberately narrow:

> A verified Hive session may prepare only an M16.2-approved Posting-authority action for the same Hive account. The browser's Hive Keychain remains the signer. Hive-Bar never receives a private key.

## Configuration state

`HIVE_WRITE_MODE` now has four recognized values:

- `disabled` — no Hive writes;
- `controlled` — the existing allowlisted/operator/delegated lane;
- `beta` — authenticated self-signing beta lane;
- `production` — still rejected before the V1 release gate.

Beta mode additionally requires:

```text
HIVE_SIGNER_MODE=keychain
```

M16.2 does not use `HIVE_CONTROLLED_ACCOUNTS` as a beta allowlist. The authenticated Hive session is the author and signer identity.

The only beta actions enabled by M16.2 are:

```text
post
comment
```

The beta action list is source-bound rather than inherited from `HIVE_CONTROLLED_ACTIONS`. Therefore configuration drift cannot accidentally expose vote, follow, subscription, M4, or payment operations through this lane.

## Preserved exact-review lifecycle

M16.2 reuses the accepted social preflight lifecycle:

1. Require the verified Hive session, same application origin, and CSRF token.
2. Build the exact Hive operation on the server.
3. Force author and signer to the verified session account in beta mode.
4. Return the exact operation, authority, summary, and SHA-256 operation fingerprint for review.
5. Require explicit user confirmation before opening Keychain.
6. Broadcast only through local Hive Keychain with Posting authority.
7. Record Keychain acceptance.
8. Observe the operation through Hive RPC with bounded checks.
9. If Keychain accepted but observation is incomplete, never retry automatically.

The existing duplicate-preflight protection and session ownership checks remain unchanged.

## Separation from controlled operations

`requireControlledMode()` is preserved for M4 and operator-controlled behavior. Beta mode does not satisfy that middleware.

Consequences in M16.2:

- profile-setting changes remain closed;
- reward claims remain closed;
- public wall transfers remain closed;
- encrypted inbox transfers remain closed;
- Pay remains closed;
- delegated merchant-author behavior remains a controlled-mode concern;
- M9/M10/M12 operator audit and terminal records are not written for beta self-signing actions.

`config.hive.writesEnabled` also remains controlled-mode-only. M16.2 uses the narrower `canWriteAction()` beta branch only for the source-bound beta actions.

## User surfaces

### Community posting

A signed-in beta user can open the existing Community composer, prepare a post to `hive-108590`, review the exact Posting operation, and approve it in Keychain.

The server ignores any caller-supplied author identity and uses the verified session account.

### Top-level comments

The existing post-level comment composer is now explicitly bound to the configured Keychain signer mode, so it can complete the same preflight/review/broadcast lifecycle as the post composer.

### Reply to a comment

Each rendered comment now exposes a Reply composer when `comment` is currently allowed. The reply sends the existing comment's author and permlink as the parent, so the already-existing generic comment operation builder creates a true nested Hive reply.

The reply author is still forced to the verified session account.

## Explicitly deferred

M16.2 does not enable or redesign:

- weighted upvotes;
- downvotes;
- Threads creation;
- follow/unfollow;
- community subscribe/unsubscribe;
- profile changes;
- reward claims;
- public wall messages;
- private encrypted inbox messages;
- HBD transfers;
- Pay or Distriator;
- any server-held signing key.

Voting direction/weight is reserved for M16.3. Wall and encrypted inbox beta enablement are reserved for M16.4.

## Regression requirements

The M16.2 regression must prove that:

- beta mode is invalid without `HIVE_SIGNER_MODE=keychain`;
- beta mode leaves `writesEnabled=false` and payments disabled;
- the source-bound beta action set is exactly `post` and `comment`;
- an arbitrary verified beta account can prepare a post without a controlled-account allowlist;
- the exact post author and signer are forced to the verified session account;
- an arbitrary verified beta account can prepare both top-level and nested comments as itself;
- voting is rejected with `BETA_ACTION_NOT_ALLOWED`;
- M4 Active-authority paths still fail closed in beta mode;
- Community exposes the post composer but not vote or subscribe controls;
- Conversation exposes both top-level and reply-to-comment composers with `data-signer-mode="keychain"`;
- the accepted controlled-mode tests continue to pass unchanged.

## Production boundary

This candidate changes repository source only. It does not change `/etc/hive-bar/hive-bar.env`, restart `hive-bar.service`, modify Caddy/Cloudflare/DNS/TLS, make a Hive write, invoke Keychain, activate payments, or touch PR #1.

The currently deployed site must remain in its existing write-disabled state until a separate exact deployment/activation authorization is granted.
