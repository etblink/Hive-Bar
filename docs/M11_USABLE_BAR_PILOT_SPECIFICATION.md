# M11.0 usable-bar pilot specification

## Decision

Run a 30-day marketing and publishing pilot before adding a content-management
system, staff roles, payments, or broader Hive social actions. The authoritative
operator account for the pilot is `@fourthstreetbar`; the community destination
is `hive-108590`.

The pilot's content source is the official bar's public Hive posts. This uses
the existing M10 Keychain Posting boundary and public read surfaces rather than
introducing a second server-side content store or a new signing capability.

## What is usable now

The deployed public site already provides:

| Need | Current surface | Pilot use |
| --- | --- | --- |
| Find the bar | Home page | Address, map, hours, and venue imagery |
| Read updates | Community and post pages | Public announcements from `hive-108590` |
| Publish an official update | M10 controlled post flow | `@fourthstreetbar`, Posting authority, Hive Keychain only |
| Availability alert | UptimeRobot `/healthz` monitor | Email notification on service outage |

The home page's business facts and images are release-managed at M11.0. They
are not yet staff-editable. The pilot must not imply that a bartender can
directly edit hours, a gallery, or a calendar from the browser.

## Exact M10 operating boundary

During an explicitly armed operator window, only the following Hive write is
available:

```text
account: @fourthstreetbar
authority: Posting
operation: community-root comment (post)
community: hive-108590
signer: the operator's local Hive Keychain
```

The server never receives a private key. The operator must review the exact
operation before Keychain opens. A cancelled review or an uncertain broadcast
is not retried automatically. The server returns to `HIVE_WRITE_MODE=disabled`
at the finite M10 deadline or through the explicit early-disable command.

The pilot does not authorize payments, transfers, memos, wall or inbox signing,
follows, votes, subscriptions, profile changes, threads, automated social
sharing, retry logic, DNS, Cloudflare, TLS, Caddy, or GitHub changes.

## Operator workflow

1. A manager prepares one short factual update using a pilot template below.
2. An M10 window is armed only for an intended publishing session.
3. The operator signs in locally as `@fourthstreetbar` with Posting authority.
4. The operator reviews the displayed account, community, title, tags, body,
   permlink, and operation fingerprint.
5. The operator accepts the one Keychain broadcast only when every displayed
   field is correct.
6. Record the transaction identifier or Keychain acceptance result in the
   bar's normal operating notes. If confirmation is incomplete, do not retry;
   inspect the public community later before deciding on a separately approved
   action.
7. When the session is finished, use the explicit early-disable path rather
   than leaving a window open unnecessarily. Automatic expiry remains the
   fail-safe.

No Hive Keychain password, private key, recovery phrase, or exported key file
belongs in Hive-Bar, a server terminal, a chat, or this operating record.

## Pilot content templates

Keep each update factual, dated, and useful to a local patron. Use one of these
four types:

| Type | Required facts | Example purpose |
| --- | --- | --- |
| Announcement | What changed, when, location | New public website or venue news |
| Event | Name, date/time, price or cover if applicable, venue | Music, watch party, or community gathering |
| Drink special | Dates/times, item, price if public, availability caveat | Weekend special or happy-hour notice |
| Service update | Date/time range and reason | Closure, altered hours, or private event notice |

Posts must not promise availability, pricing, employment, alcohol service, or
event details that have not been approved by the bar. Use a normal public
contact route for corrections; do not ask patrons to send keys, money, or
private information through Hive-Bar.

## Thirty-day pilot targets

The purpose is to discover whether this workflow helps the bar, not to maximize
on-chain activity.

| Measure | Target | Evidence |
| --- | --- | --- |
| Official updates | 4–8 useful posts across the four templates | Public community links and redacted M10 audit events |
| Reliability | No unresolved UptimeRobot incident | Monitor history and email alerts |
| Staff friction | One designated operator can complete the checklist without key sharing | Brief manager note after each session |
| Patron usefulness | Each update contains a date/time or durable visitor fact | Editorial review of the published post |
| Security | No action outside M10 scope | M10 state, audit metadata, and expiry evidence |

Do not treat likes, follows, token rewards, or revenue as acceptance criteria
for this first operational pilot.

## M11.1 implementation recommendation

After at least a small set of real official updates exists, implement one
read-only home-page slice: a clearly labelled **Latest from 4th Street Bar**
section that renders a bounded list of recent official `@fourthstreetbar`
posts from `hive-108590`, with links to the full sanitized post pages.

M11.1 must remain a read-only Hive integration. It should have an intentional
empty state, no browser key access, no new write action, no social-media API,
and no server content database. This makes the marketing home page useful
without creating a competing content-management system.

The official update author is a configuration value, not a hard-coded browser
identity. M11.1 does not alter M10's existing requirement that the authenticated
session account itself is `@fourthstreetbar`.

## Staff authority boundary for a later M12 decision

Staff should keep using their own Hive accounts. Do not copy the
`@fourthstreetbar` Posting key into ordinary staff browsers. A later, separately
authorized M12 operation may add narrowly scoped delegated Posting authority
for named personal accounts, using an owner-approved Active-authority update,
then extend the operator UI to distinguish the signer from the merchant author.
That is an on-chain authorization change and is explicitly outside M11.1.

The bar owner’s Owner and Memo keys are not required for ordinary posting and
must not become part of the day-to-day browser workflow. M12 should require
only the minimum authority needed for its one approved operation.

## Deferred decisions

M12 is the first point at which to choose an operator-editable source for
hours, events, specials, and gallery items. That choice needs an explicit
decision on who may edit, review, publish, and roll back public information.
It must not be smuggled into the Hive signing flow.

M13 may consider broader community participation only after M12's staff
workflow is accepted. M14 payments, HBD purchase flows, and Distriator remain
a separate commercial and security program with their own business policy,
merchant handling, receipts, refunds, and incident response requirements.

## M11.0 acceptance

M11.0 is complete when this specification is reviewed as the controlling
30-day pilot plan. It creates no server state, Hive operation, Keychain
request, payment path, or public-exposure change.
