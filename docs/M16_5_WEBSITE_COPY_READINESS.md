# M16.5 — Website Copy Readiness

## Source binding

M16.5 is rooted exactly at accepted M16.4 source commit:

`fa15b5d135e7bedba8485ac26bcdec2958e7e378`

Production remains write-disabled and is not changed by this milestone.

## Goal

Make Hive-Bar understandable to an ordinary beta tester without weakening the safety information needed for blockchain actions.

The user-facing voice is:

- plain and welcoming;
- centered on 4th Street Bar and its community;
- Hive-aware without assuming blockchain expertise;
- explicit about irreversible or public actions when that matters;
- technical only when the user deliberately opens technical details.

## Copy changes

M16.5 revises the primary navigation, home page, Community, conversations, profiles, wallet, Wall, Inbox, settings, Pay, Keychain sign-in, write-state feedback, and exact-operation review presentation.

Implementation and operator terms are removed from ordinary visible copy where they do not help the user. Examples include milestone names, controlled-write language, on-chain-state labels, exact-operation terminology in primary instructions, raw thread-container identifiers, and UTF-8-byte terminology in ordinary counters.

The exact transaction evidence is not removed. The review dialog keeps the operation fingerprint and exact operation JSON under an expandable `Technical details` section.

## Preserved safety facts

M16.5 keeps the following user-visible facts explicit:

- Hive-Bar never asks for or stores private keys.
- Hive Keychain remains the approval/signing boundary.
- Public wall messages and their transfer details are permanent on Hive.
- Private-message text is encrypted in the browser, while sender, recipient, HBD amount, time, and transaction remain public on Hive.
- Ambiguous post-approval state must not lead to an automatic or duplicate retry.
- Pay is not marked Paid merely because Keychain approved a broadcast; final confirmation remains required.

## Functional boundary

M16.5 is a copy/usability milestone. It does not expand the beta action allowlist, change operation construction, alter signing authority, activate production writes, enable payments, enable Distriator, or modify infrastructure.

Existing beta capabilities remain:

- post;
- comment/reply;
- weighted upvote/downvote;
- public wall message;
- encrypted private message.

Other write capabilities remain closed unless separately authorized.

## Acceptance evidence

The regression suite must verify that:

1. representative public and beta pages no longer surface operator/developer copy as ordinary instructions;
2. friendly copy does not hide privacy, permanence, payment, or no-retry warnings;
3. transaction fingerprints and exact operation JSON remain available as secondary technical details;
4. existing write hooks and authorization boundaries remain intact;
5. the full deterministic CI quality gate passes on Ubuntu and Windows.

## Frozen lanes

M16.5 does not authorize:

- production deployment;
- production beta/write activation;
- Hive writes;
- Keychain requests;
- payment activation;
- Distriator activation;
- Cloudflare, DNS, Caddy, systemd, environment, or other infrastructure changes;
- mutation of PR #1;
- integration into `codex/m6-read-only-release-readiness` before separate acceptance and authorization.
