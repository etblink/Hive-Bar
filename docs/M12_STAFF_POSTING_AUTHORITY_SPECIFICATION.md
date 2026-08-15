# M12.0 staff posting-authority specification

## Purpose and current state

M12 is a decision and design milestone, not an authorization update. It defines
how selected bar staff might publish a narrow class of official community-root
posts while signing from their own Hive accounts. It does not change the
currently deployed M10 boundary:

```text
author and authenticated session: @fourthstreetbar
authority: Posting
action: one community-root post to hive-108590
mode: finite, explicitly armed, and normally disabled
```

M11's public feed remains read-only. No M12.0 document authorizes a server
contact, Hive read or write, Keychain request, account-authority update, or
deployment.

## Critical authority fact

Adding a personal account to `@fourthstreetbar`'s on-chain Posting
`account_auths` is **not operation-scoped**. A sufficient delegated account can
sign any Posting-authority operation as `@fourthstreetbar` from any compatible
Hive client; Hive does not limit that delegation to Hive-Bar, one community, or
a time window.

Hive-Bar can constrain its own user interface and server routes, but it cannot
reduce the authority granted by the blockchain. Therefore ordinary staff should
not receive delegated merchant Posting authority merely for convenience. This
model is appropriate only for individually named, trusted managers who are
authorized to speak publicly for the bar and who accept the revocation process.

Never copy the `@fourthstreetbar` Posting key into staff browsers. Each
authorized person instead retains only the Posting key for their own personal
account in their local Hive Keychain.

## Roles and minimum authority

| Role | Account and Keychain authority | Permitted responsibility | Not permitted by M12.0 |
| --- | --- | --- | --- |
| Authority custodian | `@fourthstreetbar` Active authority, held by the bar owner | Review and sign a future exact authority update or revocation | Day-to-day post publishing with Active/Owner/Memo authority |
| Bar manager | Personal Hive account with its own Posting key | May be nominated for delegated Posting authority after approval | Receive merchant key material or change authority |
| General staff | Personal Hive account | May draft or submit content for management review | Receive merchant delegation by default |
| Hive-Bar server | No Hive private key | Verify current public authority, prepare exact operation, record redacted audit data | Broadcast, store keys, or decide staff eligibility on its own |

The authority custodian uses **Active**, not Owner or Memo, for a future
`account_update2` posting-authority change. Owner and Memo keys stay out of the
normal browser workflow.

## Approval record required before any delegation

At the staff meeting, create an off-chain approval record for each nominated
manager. The record contains no keys and lists:

1. Personal Hive account name, canonical lowercase spelling, and identity
   confirmation.
2. Bar role, manager approving the nomination, and a business reason.
3. The acknowledgement that delegation is broad Posting authority—not merely
   permission to use one Hive-Bar page.
4. Start date, review date, and the named authority custodian who can revoke it.
5. The required outcome if the person changes roles, loses a device, or reports
   a suspected compromise: immediate server disable followed by authority
   revocation.

No account is inferred from a browser login, an email address, or a display
name. There is no source-code list of staff accounts. Any runtime allowlist
must be explicit, protected, reviewable, and independently matched to the
public on-chain authority before a post preflight is accepted.

## Future M12 implementation boundary

Before a staff account can publish through Hive-Bar, a separately authorized
implementation must require all of the following:

| Check | Required result |
| --- | --- |
| Session identity | Keychain authenticates the named personal account with Posting authority. |
| Merchant authority | Fresh public Hive read proves that the personal account currently satisfies `@fourthstreetbar`'s Posting threshold. |
| Local allowlist | The protected, explicit manager allowlist contains that same personal account. |
| Operation identity | Exact review shows **signer account** and **merchant author** separately, with author fixed to `@fourthstreetbar`. |
| Scope | Only a community-root `comment` to `hive-108590`; no replies, follows, votes, profiles, wall, inbox, payments, transfers, memos, or retries. |
| Time | A finite operator window is active; the server returns to disabled mode at expiry or explicit early disable. |
| Audit | Append redacted event time, signer, author, action, operation fingerprint, and transaction identifier when supplied—never post body, keys, cookies, or signatures. |

The server-side checks are defense in depth only. They do not remove the
separate, broader authority that exists while an account remains delegated on
Hive.

## Exact on-chain change shape for later review

A future authority-change run must first read and display the complete current
`@fourthstreetbar` Posting authority. It may propose exactly one
`account_update2` operation signed once by the authority custodian's Active
Keychain authority. The review must show the complete before/after authority
JSON and reject any difference other than the approved account-auth entry or
entries.

It must not change the Posting threshold, existing key authorizations, Active,
Owner, or Memo authority, profile metadata, beneficiary settings, or any other
account field. The proposed result must be checked locally for a safe threshold
and separately read back from Hive after the broadcast. No automatic retry is
permitted when broadcast confirmation is uncertain.

## Revocation and incident response

There is no automatic on-chain expiry for a delegated account authority. A
server window expiring disables Hive-Bar's interface, but does not remove the
delegation from Hive. Revocation therefore has two deliberate steps:

1. Immediately use the existing M10-style server disable path to remove the
   Hive-Bar publishing interface.
2. In a separately reviewed Active-authority operation, remove the exact
   personal account from `@fourthstreetbar` Posting `account_auths`, then read
   the public authority back to verify removal.

If an account or device may be compromised, treat the delegation as compromised
until the read-back confirms removal. Do not rely on password resets, browser
sign-out, or an unexpired server window as revocation.

## Decision gates and roadmap

| Milestone | Scope | Authorization needed |
| --- | --- | --- |
| M12.1 | Offline code and test design for separate signer/author, explicit allowlist, and audit shape | Local source only |
| M12.2 | Read-only authority and candidate-account preflight | Explicit live Hive-read authorization; no Keychain or write |
| M12.3 | One exact Active-authority delegation or revocation review and broadcast | Named accounts, complete JSON diff, single Keychain request, and explicit product-owner authorization |
| M12.4 | Target-bound server deployment and fresh-session verification | Explicit deployment authorization after M12.3 evidence is accepted |
| M12.5 | One supervised manager post | Separate finite window and exact-post authorization |

The recommended immediate next step is M12.1, not delegation. It can determine
whether the product can safely distinguish signer from merchant author while
keeping M10's normal mode disabled.

## M12.1 development fixture

M12.1 uses `@fartman69` only in local deterministic tests. The tests model a
direct, threshold-satisfying Posting `account_auths` entry for
`@fourthstreetbar`, then a revoked entry. They prove that the preflight records
the merchant author and personal signer separately, and that a simulated
revocation prevents preflight before a Keychain request or post operation.
They do not read or change either live Hive account.
