# M3 verified identity and social writes

M3 adds verified Hive identity and a deliberately narrow controlled-write path for eight social actions. It does not give the server signing authority and does not enable normal production writes.

## Identity design

1. `POST /auth/challenge` validates a claimed account and issues a short-lived, random, single-use challenge. The signed text displays the account, configured application origin, issuance/expiry time, nonce, and the statement that no Hive transaction is authorized.
2. The browser calls Hive Keychain `requestSignBuffer` with Posting authority. Passwords and private keys never enter Hive-Bar.
3. `POST /auth/verify` consumes the challenge before verification, hashes the server-owned message, verifies the compact signature, reads the claimed account from Hive, and checks the returned public key against its current posting authority. Bounded delegated `account_auths` are supported.
4. A successful verification creates an opaque server-side session. The cookie is HttpOnly and SameSite=Strict, gains Secure in production, has a fixed expiry, and contains no account identity or signing capability.
5. State-changing application requests require the same configured Origin, the opaque session, and the session's in-memory CSRF token. Logout destroys the server session.

The browser never treats local storage, session storage, hidden account fields, URL parameters, or cookies as authenticated identity. Social operation authors, voters, followers, and subscribers always come from the verified server session.

## Social operation boundary

`src/hive/social-operations.js` builds all operations as pure values. Exact golden vectors cover:

| Action | Hive operation | Fixed protocol behavior |
| --- | --- | --- |
| Post | `comment` | empty `parent_author`; `parent_permlink` exactly `hive-108590` |
| Thread | `comment` | reply to the currently resolved `fourthst.threads` container |
| Comment | `comment` | exact validated parent author/permlink |
| Vote | `vote` | accessible 1–100 percent becomes integer 100–10,000 weight |
| Follow/unfollow | `custom_json`, id `follow` | `what: ["blog"]` or `what: []` |
| Subscribe/unsubscribe | `custom_json`, id `community` | exact configured-community payload |

Titles, bodies, tags, permlinks, application metadata, targets, and percentage are validated before Keychain. Protocol-shaped limits use UTF-8 byte counts and the UI shows live byte counters.

The server's Hive transport remains read-only. `src/hive/read-methods.js` still rejects every broadcast or unknown method before Fetch. The browser extension is the only component that can sign and broadcast.

## Controlled state machine

Every social form follows this sequence:

1. Fetch the current server-verified session and CSRF token.
2. Build and store one exact preflight, bound to that session and account.
3. Reject an identical operation while it is prepared or awaiting observation.
4. Show the signing account, Posting authority, human summary, and exact JSON.
5. If the user cancels, delete the prepared preflight and report that nothing was broadcast.
6. If confirmed, pass the exact operations to Keychain `requestBroadcast`.
7. Record Keychain acceptance and the transaction id when supplied. This state is called **broadcast accepted**, not success.
8. Poll only allowlisted read methods. Mark complete and reload authoritative state only after the exact content, vote weight, follow state, or subscription state is observed.

A failed or cancelled Keychain request releases the preflight and never changes the displayed social state. A callback accepted by Keychain but followed by an application error is explicitly uncertain and is never automatically retried.

## Configuration gates

- `HIVE_WRITE_MODE=disabled` is the default and renders social controls gated.
- `HIVE_WRITE_MODE=controlled` also requires `HIVE_CONTROLLED_ACCOUNTS`.
- The session account must be in that allowlist on every preflight, cancellation, acceptance, and observation request.
- `HIVE_WRITE_MODE=production` is rejected for M3.

The mandatory live procedure is in [M3_CONTROLLED_WRITE_RUNBOOK.md](M3_CONTROLLED_WRITE_RUNBOOK.md).

## Primary references

- [Hive Keychain extension request API](https://github.com/hive-keychain/hive-keychain-extension/blob/master/documentation/README.md)
- [Hive custom JSON operations](https://developers.hive.io/apidefinitions/broadcast-ops.html#broadcast_ops_custom_json)
- [Hivemind communities protocol](https://gitlab.syncad.com/hive/hivemind/-/blob/master/docs/communities.md)
