# M2 read-only vertical slice

M2 turns the M1 foundation into a complete public browsing journey for 4th Street Bar. It remains deliberately unable to sign or broadcast Hive operations.

## Product targets

| Target | M2 value |
| --- | --- |
| Production community | `hive-108590` |
| Production thread-container account | `fourthst.threads` |
| Default community sort | newest (`created`) |
| Page size | 10 posts |
| Hive writes | disabled and transport-blocked |

The landing defaults were checked against the [official 4th Street Bar site](https://4thstreetbarreno.com/): 1114 E. 4th Street in Reno, `(775) 324-7827`, and daily noon–2:00 a.m. hours. Production must set these business values explicitly. Stock photos, fabricated testimonials, and the obsolete logo hotlink were removed; the photo area says plainly that owner-approved images are pending.

## Public surface

- `/` presents current business essentials and a public community entry without login.
- `/community` renders community metadata and the first post page on the server. Sort and cursor navigation work as ordinary links/forms and are progressively enhanced with HTMX.
- `/community/threads` resolves the latest authored top-level post from `fourthst.threads`, then reads its flattened Bridge discussion. A missing container and an empty discussion have distinct sparse states.
- `/post/:author/:permlink` renders one complete document on direct navigation and a fragment for an HTMX request. Replies receive bounded visual depth after parent relationships are resolved.
- `/profile/:username` uses normalized Bridge profile metadata and account posts.
- `/profile/:username/wallet` displays public read-only account values; no owner action or transfer control is present.

Community information remains visible if its post request alone fails. HTMX error responses are swapped into the affected region with a retry link instead of replacing the document.

## Read architecture

`src/hive/read-service.js` is the domain boundary for M2 reads. Social content uses current Bridge methods and batches author profiles once per page. It does not issue legacy per-post vote or profile requests. Markdown is normalized once through the existing allowlist sanitizer before any template receives HTML.

Pagination cursors contain only a validated Hive author/permlink anchor in base64url JSON. They confer no authority. The service tolerates Bridge nodes that include or exclude the start anchor, removes a repeated anchor, fetches one look-ahead item, and emits a cursor only when another page is present.

`src/hive/read-methods.js` allows only the methods needed by health, community, profile, follow-list, and wallet reads. `HiveRpcPool.call()` checks that allowlist before choosing a node or invoking Fetch. Broadcast, account-history, and unknown methods therefore fail locally with `READ_ONLY_RPC_POLICY`.

## Wallet calculations

The public wallet uses a single fixed observation timestamp for every value in one response.

Effective vesting shares are:

```text
own vesting shares + received vesting shares - delegated vesting shares
```

Hive Power is:

```text
effective vesting shares × total vesting fund HIVE / total vesting shares
```

RC and voting manabars regenerate linearly over Hive's five-day recharge period and are clamped from 0% to 100%. Voting power prefers the current voting manabar and retains a legacy timestamp/power fallback. Claimable HIVE, HBD, and vesting rewards remain exact read values; claiming is absent.

The voting-power pitcher, HP milestone, and meters are presentation layers. Exact numbers remain visible in text or native `meter` elements. The original HP milestone thresholds were moved to the single frozen, tested `src/hive/milestones.js` table.

## Deterministic and live checks

`test/fixtures/hive/m2-read-slice.json` records:

- one production-shaped `hive-108590` post;
- no `fourthst.threads` container;
- Bridge community, profile, account-post, and flattened-discussion shapes;
- positive and negative votes;
- adversarial stored content and unsafe profile-image metadata;
- account, global vesting, and RC snapshots with independently calculated 550 HP, 70% voting power, and 60% RC at the fixture timestamp.

The deterministic suite never falls back to LeoFinance or any other live community. `npm run smoke:live` performs only allowlisted reads against configured production targets, including a sample post, profile, discussion, and wallet when a post exists. Normal CI does not depend on it. A manually dispatched GitHub Actions workflow runs the live smoke after the deterministic job in a network-capable environment.

## M2 boundary

M2 includes public balance and reward summaries because those values are already public on Hive. It does not expose private owner data or owner actions. Login, sessions, post/comment/vote writes, follows, subscriptions, profile updates, reward claims, wall/inbox transfers, QR payments, and receipts remain later-milestone work.
