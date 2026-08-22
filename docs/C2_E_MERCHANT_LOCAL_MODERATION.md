# C2-E Merchant-Local Moderation

## Status and boundary

C2-E is a Fourth Street Bar presentation-policy feature. It does **not** delete, edit, flag, vote, mute, broadcast, or otherwise alter Hive content. Hive remains the canonical public data source. The local moderation database records only Fourth Street Bar display rules and their audit history.

C2-E is limited to:

- Fourth Street Bar Community post feeds;
- Threads displayed from the configured Threads container;
- direct Fourth Street Bar Community post conversations and replies;
- operator-only local hide/unhide management.

C2-E does not change profile/blog feeds, Wall, Inbox, followers/following, homepage official updates, payments, Distriator, onboarding, controlled/delegated posting, Hive signing, or dormant V1 behavior.

## Authorization

Moderation authority is deliberately separate from Hive write authority.

- `HIVE_MODERATION_ENABLED` controls whether the local moderation subsystem is active.
- `HIVE_MODERATION_OPERATOR_ACCOUNTS` is the explicit verified-Hive-account allowlist.
- The actor is always derived from the authenticated Hive-Bar session. Caller-supplied operator identity is never trusted.
- Mutation requests require the configured application origin, a verified session, and the existing CSRF token.
- No Hive Keychain request is prepared for a moderation change.

`HIVE_CONTROLLED_ACCOUNTS`, M10 operator arming, M12 delegated signers, payment authority, and onboarding authority do not confer moderation authority.

## Durable state model

The production database path is intended to be:

`/var/lib/hive-bar/moderation/moderation.sqlite3`

The SQLite database uses defensive mode, foreign keys, a bounded busy timeout, WAL journaling, `synchronous=FULL`, strict tables, and a schema-version record.

Two tables define the model:

1. `moderation_targets` retains one stable row for each account or exact `author/permlink` target and records whether it is currently active.
2. `moderation_events` is append-only audit history for `hide` and `unhide` transitions.

A hide/unhide state transition and its audit event commit in the same immediate SQLite transaction. Unhiding does not delete the target or its history. Re-hiding the same target reuses its target identity while appending a new audit event.

Only account/permlink identity, bounded internal reason text, operator identity, and timestamps are stored. Hive post bodies, images, votes, payout data, keys, signatures, and private data are not copied into the moderation database.

## Read semantics

An active account rule suppresses Community content authored by that account. An exact-content rule suppresses only the matching `author/permlink`.

Community pagination applies moderation before the visible page and sentinel are finalized. Hidden entries therefore do not consume visible slots. The scanner is bounded and advances over raw Bridge results without automatically retrying or creating an unbounded crawl.

For a discussion, hiding a comment suppresses that comment and every descendant beneath it. This prevents a reply from being shown as if its hidden parent never existed. Sibling branches remain visible.

A hidden Fourth Street Bar Community root requested directly returns the same generic not-found posture as absent content. Profile/blog reads remain outside C2-E.

Profiles are hydrated only after local moderation filtering, so hidden Community authors are not unnecessarily hydrated for the rendered result.

## Unavailable-store posture

When moderation is disabled, Hive-Bar uses the existing read paths unchanged.

When moderation is enabled but the store is missing, corrupt, unsafe, or has an unsupported schema, affected Community/Threads/moderation surfaces fail closed with `MODERATION_STORE_UNAVAILABLE` rather than silently rendering content without the local policy. Unrelated profile/blog and other product surfaces remain available.

A mutation that cannot be durably recorded is not reported as successful. The browser does not automatically retry an ambiguous moderation write; it instructs the operator to inspect Moderation history before attempting another change.

## Initial production storage preparation

The repository contains `ops/privex/bin/hive-bar-prepare-moderation-storage` and the narrow systemd writable-path drop-in under `ops/privex/hive-bar-moderation.service.d/`.

These are **source assets only**. Source qualification must not execute them, change `/etc/hive-bar`, create production directories, restart the service, or enable moderation.

A separately authorized activation should:

1. verify the exact accepted source release and production baseline;
2. run the root-only storage preparation helper once for initial provisioning;
3. install the reviewed systemd drop-in and reload systemd;
4. configure an explicit operator allowlist and durable database path while keeping all unrelated runtime gates frozen;
5. activate `HIVE_MODERATION_ENABLED=true` only in that separately authorized deployment/activation bundle;
6. verify permissions, schema, service health/readiness, fail-closed behavior, public Community filtering, and unchanged beta/Hive-write gates.

The preparation helper creating an empty database file is valid only for **initial provisioning**. It is not a recovery procedure for a missing accepted moderation database.

## Backup

Backups must be SQLite-consistent. Do not copy only `moderation.sqlite3` while WAL activity may exist and then assume that copy is complete.

Use a SQLite-aware backup mechanism such as the SQLite CLI `.backup` command against the live database, writing to a root-controlled backup location outside the release tree. After backup:

1. run `PRAGMA integrity_check;` against the backup and require exactly `ok`;
2. record a SHA-256 digest of the resulting backup file;
3. record the source release commit/tree, schema version, UTC timestamp, and file size alongside the digest;
4. protect the backup with owner-only permissions appropriate to the host runbook.

Backup operations do not require or imply Hive, Keychain, ImageHoster, payment, onboarding, or controlled/delegated action.

## Recovery

Recovery is a separately authorized maintenance operation.

1. Do not silently create a new empty database when an accepted moderation store disappears or fails integrity checks.
2. Preserve the suspect/current database and its WAL/SHM companions before replacement.
3. Validate the candidate backup with `PRAGMA integrity_check;`, verify its recorded SHA-256 digest, and require the supported schema version before installation.
4. Install the replacement as a regular non-symlink file owned by `hivebar:hivebar` with mode `0600` inside the reviewed `0700` moderation directory.
5. Perform one controlled service restart and verify that the active rules and recent append-only audit history match the recovery record before accepting the service.
6. If validation fails, leave Community moderation fail-closed; do not bypass the store merely to restore page availability.

## Qualification contract

A C2-E candidate is acceptable only if deterministic qualification proves:

- strict reversible storage plus append-only history;
- atomic state/history transitions and idempotent duplicate hide handling;
- verified-session actor derivation and explicit operator allowlisting;
- origin/CSRF/session rejection and independence from all Hive write modes;
- exact account/content matching;
- moderation-aware pagination without hidden items consuming visible slots;
- coexistence with the technical Threads-container exclusion;
- hidden-comment descendant suppression with visible sibling preservation;
- generic not-found behavior for hidden Community roots;
- profile hydration only for visible Community authors;
- identical policy across full-page and HTMX Community reads;
- affected-surface 503 behavior when an enabled store is unavailable;
- unchanged profile/blog, Wall/Inbox, payments/Distriator, onboarding, Hive-operation, controlled/delegated, DNS, and dormant V1 boundaries.

Rendered qualification covers 390px and 1440px widths for Community controls/dialog, Threads branch suppression, full-conversation branch suppression, the operator management/history page, and the unavailable-store state. Controls must expose target-specific labels, native dialog semantics, focus return on cancel/close, status announcements, optional bounded reason text, and explicit local-only/Hive-unchanged disclosure. Visual capture forbids non-GET application mutations and stubs Keychain so no signing can occur.
