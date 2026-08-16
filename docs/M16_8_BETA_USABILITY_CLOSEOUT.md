# M16.8 Beta Usability Closeout

## Scope

M16.8 is a source-only usability and safety closeout milestone rooted exactly at accepted M16.7 commit `54dd27aa88be3673bc349af38abfd8bd95c0e623` / tree `ff580a4dbbefd9cb7e92a919dece4c280a04ed82`.

It addresses the remaining non-critical Phase C observations without expanding the beta write manifest and without changing the exact operation builders, Keychain authorities, or no-auto-retry policy.

M16.8 does not deploy source, edit the production environment, restart services, broadcast Hive operations, request Keychain signatures, activate Pay/Distriator, modify Cloudflare/DNS/Caddy/systemd, mutate PR #1, or broaden controlled/operator/delegated authority.

## Pending confirmation safety

The M16.6 browser clients already stopped automatic observation after a bounded number of read-only checks, but the original submit button became available again even when Keychain had accepted the broadcast and Hive-Bar still showed confirmation as pending.

M16.8 adds a post-load usability layer that preserves the existing signing path but changes the pending state after Keychain acceptance:

- the original action is never automatically retried;
- a successfully recorded pending preflight changes the submit control to `Recheck Hive confirmation`;
- pressing that control performs only the existing `/observe` call for the same preflight and never opens Keychain, prepares another operation, or broadcasts another operation;
- if the accepted-state request itself is ambiguous after Keychain has approved the broadcast, the form is locked as `Confirmation pending` instead of becoming submit-ready again;
- pending and recheck messaging explicitly says that an unconfirmed read is not proof that the Hive write failed.

This is deliberately a page-lifetime guard. M16.8 does not persist private message bodies, operation payloads, or pending write state into browser storage.

## Wall landing behavior

After a public Wall transfer is observed on Hive, the client now navigates to the exact confirmed transfer recipient's public Wall route:

`/profile/<recipient>/wall-posts`

The destination is derived from the reviewed preflight transfer operation rather than from an untrusted free-form redirect parameter. Inbox and other actions retain their existing reload behavior.

## Keychain placeholder closeout

During the Phase C insufficient-downvote-mana rejection, the Hive Keychain popup displayed raw `${v}`, `${d}`, and `${r}` placeholders. That rendering occurs inside the external Keychain interface, not inside Hive-Bar.

Hive-Bar's Keychain adapter already maps unsuccessful extension responses to bounded application-owned messages and does not surface the extension's raw error string. M16.8 freezes that boundary with a regression test proving raw placeholder text is not copied into Hive-Bar UI error messages.

No attempt is made to rewrite or patch the Hive Keychain extension UI.

## Asset coherence

`/js/m16-beta-usability.js` is registered as a first-party versioned asset. Under the accepted M16.7 runtime-byte hashing mechanism, its public URL is bound to the SHA-256 of the exact deployed bytes.

## Frozen beta boundary

The beta manifest remains exactly:

- `post`
- `comment`
- `vote`
- `wall`
- `inbox`

Posting remains self-signed through Keychain Posting authority. Wall/Inbox remain session-bound Active transfers. Private Inbox plaintext remains local to the browser before Memo encryption. Pay and Distriator remain disabled. Controlled/operator/delegated lanes remain inert.

## Source acceptance criteria

M16.8 is acceptable only if:

- the candidate descends exactly from accepted M16.7;
- a pending Keychain-accepted social action can be rechecked without another preflight or Keychain broadcast;
- an ambiguous post-Keychain accepted-state request locks the action instead of permitting a duplicate submission;
- a confirmed public Wall action lands on the exact recipient Wall route;
- raw external Keychain `${...}` placeholders remain outside Hive-Bar-owned error text;
- the new client layer is covered by M16.7 first-party runtime-byte asset versioning;
- the complete Ubuntu and Windows quality gates pass;
- no production, Hive, Keychain, payment, Cloudflare, DNS, Caddy, or unrelated infrastructure mutation occurs during source qualification.
