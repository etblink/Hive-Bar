# M16.7 Production Hardening

## Scope

M16.7 is a source-only hardening milestone rooted exactly at accepted M16.6 commit `aa026e588a922f5db75984babfcabb8ed12a5e19` / tree `16daa496a81512fb153d53e8853c4a35996e0dd0`.

It addresses two defects exposed by accepted Phase C production testing without changing the beta action boundary:

1. first-party static assets could be served from an older Cloudflare cache object while current HTML came from the new release;
2. social-write confirmation and vote counts depended on Bridge-indexed content that could lag or omit zero-rshares active votes even after a valid Hive transaction was accepted.

M16.7 does not deploy source, edit production environment variables, restart services, broadcast Hive operations, request Keychain signatures, activate Pay/Distriator, or modify Cloudflare, DNS, Caddy, systemd, or PR #1.

## Bound Phase C evidence

The cache-coherence defect was reproduced on `/js/m4-actions.js`: the normal public URL returned a Cloudflare `HIT` for older bytes without the M16.6 signer-review fix, while a cache-busted request returned the current M16.6 bytes containing the fix. A one-object Cloudflare purge restored the unversioned URL and the browser runtime to the accepted M16.6 script.

The read-observation defect was independently demonstrated after successful self-signed post, reply, nested-reply, and vote broadcasts. In particular, transaction `3ecbceae0d510010bcf297fd07d27b5dbde17a3d` recorded `@fartman69` at `percent=100` on three independent Hive RPC nodes while Hive-Bar still showed `0 upvotes`. Supplemental Phase C then proved a `-100` downvote in transaction `a7e4c5e685e99e4b52876cc0714526c03e4962aa` and its replacement by a `+100` upvote in transaction `78097fe77d83dd94a0216ceee3280ba37a7711a5`.

## Static-asset coherence

All first-party CSS and JavaScript references in the shared shell now carry the exact Git blob identity of the referenced asset as a query revision. The M16.7 regression gate recomputes each Git blob identity from normalized source bytes and refuses a template whose revision does not match its asset.

This makes a changed asset receive a changed public URL. An unchanged asset retains the same URL because its bytes are identical. The mechanism requires no production environment setting and does not rely on a manual cache purge for future first-party asset changes.

## Social-write observation

The live server applies a bounded read-consistency wrapper to the existing Hive read service.

When Keychain provides a transaction id, social observation first queries `account_history_api.get_transaction` and requires all of the following before declaring success:

- the returned transaction id exactly matches the accepted id;
- the transaction contains the same number of operations as the prepared preflight;
- each operation type and value is exactly equivalent after normalizing tuple and Appbase operation representations;
- the observed block number is retained when available.

This removes Bridge indexing from the primary confirmation path. Unknown transactions remain pending and are never treated as failure or automatically retried.

When Keychain does not provide a transaction id, comment observation falls back to `condenser_api.get_content` and vote observation falls back to `condenser_api.get_active_votes`. Both methods are explicitly added to the read-only RPC allowlist.

## Vote-count read-back

The full post/conversation read keeps the existing Bridge discussion for content and replies, then refreshes the root post's positive and negative vote counts from `condenser_api.get_active_votes`. The existing vote-count rules count positive or negative `rshares` when nonzero and otherwise use the signed `percent`, so a valid low-strength vote with `rshares=0` remains visible.

If the direct active-vote read is temporarily unavailable, Hive-Bar preserves the existing Bridge-derived counts rather than failing the entire page. This favors availability while making the normal successful path more current and complete.

## Frozen behavior

The M16.6 beta manifest remains exactly:

- `post`
- `comment`
- `vote`
- `wall`
- `inbox`

Controlled/operator/delegated lanes remain inert in beta. Pay and Distriator remain disabled. Active-authority Wall/Inbox review, ciphertext-only private memo construction, no-auto-retry behavior, source deployment discipline, environment rollback discipline, and all accepted M15/M16 rendering/authentication behavior remain unchanged.

## Source acceptance criteria

M16.7 is acceptable only if:

- the candidate descends exactly from accepted M16.6;
- every first-party CSS/JavaScript shell reference is bound to the exact referenced asset bytes;
- transaction-id social observation verifies exact transaction and operations;
- no-transaction-id comment/vote fallback remains read-only and uses direct condenser reads;
- root post vote counts include zero-rshares signed-percent votes from direct active-vote data;
- direct vote-count failure preserves page availability via the existing Bridge result;
- the complete lint/build/test/audit gate passes on Ubuntu and Windows CI;
- no production or Hive mutation occurs during source preparation and CI qualification.
