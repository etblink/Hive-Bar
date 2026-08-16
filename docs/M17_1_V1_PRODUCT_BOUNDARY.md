# M17.1 V1 Product Boundary

Status: **accepted product-boundary decision**.

M17.1 freezes the deterministic patron-facing V1 functional boundary before release-governance work. It does not deploy source, alter production, change Hive state, request Keychain, activate payments, change Cloudflare/DNS/Caddy, or mutate `main`.

## Required V1 capabilities

The V1 patron-facing release must retain the accepted public/read surfaces, Keychain identity, deterministic review-before-signing, no automatic retry, post-broadcast observation, runtime-byte asset versioning, and production health/readiness/release controls.

The V1 self-signing action set is:

### Posting authority

- `post`
- `thread`
- `comment`
- `vote`
- `follow`
- `unfollow`
- `subscribe`
- `unsubscribe`
- `profile`

### Active authority

- `wall`
- `inbox`

Wall and Inbox retain the accepted exact HBD transfer semantics, fee review, sender exclusions, and client-side Memo encryption boundary for Inbox plaintext.

## Deferred beyond V1

The following are not V1 blockers:

- reward claiming;
- additional wallet operations such as arbitrary transfers, power-up/down, conversions, markets, or delegation;
- a full CMS;
- advanced application-specific administration/moderation;
- persistent browser storage for pending Hive writes;
- new social operation types not already implemented deterministically.

## Separate commercial/operational lanes

These remain outside the V1 self-signing release gate:

- Pay Tab genuine-purchase activation;
- Distriator;
- controlled bar-operator posting;
- delegated staff posting authority.

## Documentation correctness rule

Current-facing documentation is part of release correctness. Historical milestone/evidence documents remain frozen snapshots, while living documentation must accurately describe the accepted present product, operational boundary, and next milestone.
