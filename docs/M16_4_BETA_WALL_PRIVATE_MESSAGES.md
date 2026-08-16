# M16.4 — Beta wall and encrypted private messages

## Source binding

M16.4 is a source-only beta-readiness candidate rooted exactly at accepted M16.3 source:

- base commit: `de46af427d73bca3ddade8dc66729bb04e382c3f`
- target branch: `codex/m6-read-only-release-readiness`
- candidate branch: `codex/m16-4-beta-wall-private-messages`

Production configuration and deployment remain unchanged while this candidate is evaluated.

## Purpose

M16.4 extends the authenticated beta self-signing lane with the two message actions already implemented by Hive-Bar:

- `wall` — a permanent public wall message carried in an HBD transfer memo;
- `inbox` — locally encrypted private memo content carried in an HBD transfer memo.

The existing M4 message protocol, fee validation, sender exclusions, encryption/decryption behavior, exact operation review, Keychain handoff, transaction observation, and no-auto-retry behavior are preserved.

## Beta authorization boundary

The M16.4 beta extension is exactly:

```text
wall
inbox
```

In beta mode:

1. the user must have a verified Hive session;
2. `HIVE_SIGNER_MODE` must remain `keychain`;
3. the transfer sender is always the verified session account;
4. caller-supplied sender identity cannot replace the session account;
5. both message actions use Hive `Active` authority because HBD is transferred;
6. `profile` and `claim-rewards` remain unavailable through the beta M4 lane;
7. Pay, Distriator, Threads creation, follow/unfollow, subscribe/unsubscribe, and other controlled-only operations remain closed.

Controlled/operator M4 behavior remains available only through the existing controlled-write authorization path.

## Public wall messages

Before a wall preflight is created, Hive-Bar re-reads the recipient's current profile settings and requires the client-visible expected fee to match the current fee exactly. A stale fee fails closed with `WALL_FEE_CHANGED` and requires a fresh review.

The server constructs the transfer using the verified session account as `from`, the requested recipient as `to`, and an HBD amount at least equal to the recipient's current wall fee. The public memo is marked with the existing Hive-Bar wall protocol marker.

Global and recipient-specific sender exclusions continue to be enforced before preflight creation.

## Encrypted private messages

Plaintext encryption remains client-side.

The browser asks Hive Keychain to encrypt marked plaintext for the recipient. Hive-Bar receives only the resulting Keychain ciphertext, validates its ciphertext shape and memo size, then constructs the exact HBD transfer preflight.

On the recipient's owner-only Inbox page, ciphertext is read from public Hive transfer history and sent directly to local Keychain for Memo-key decryption. Decrypted plaintext is inserted into the browser page and is not sent back to Hive-Bar.

"Private" refers to the encrypted message content. The sender, recipient, amount, timestamp, and transaction remain public on Hive.

## Exact review and transaction lifecycle

M16.4 keeps the existing lifecycle:

```text
prepare exact operation
→ inspect summary / authority / operation / fingerprint
→ explicit user confirmation
→ Hive Keychain Active-authority broadcast
→ mark accepted
→ bounded exact RPC observation
→ observed or incomplete-confirmation state
```

If Keychain accepts a broadcast but confirmation is incomplete, automatic retry remains blocked.

Cancellation before Keychain destroys the prepared preflight without broadcasting.

## UI boundary

Authenticated beta users may now see both message composers on a profile Wall page:

- Leave a public wall message
- Send an encrypted inbox message

The current wall fee remains displayed before composition. The public-message form states that the exact Active operation is reviewed before signing. The encrypted-message form states that encryption occurs in the browser and that Hive-Bar receives only ciphertext.

The recipient's Inbox remains owner-only.

## Regression requirements

M16.4 regression coverage requires:

- beta mode remains Keychain-only;
- beta M4 action set is exactly `wall` and `inbox`;
- wall transfers force `from` to the verified session account;
- inbox transfers force `from` to the verified session account;
- wall preflight uses Active authority and the exact marked public memo;
- inbox preflight uses Active authority and accepts only marked Keychain ciphertext;
- ciphertext is absent from the human-readable preflight summary;
- stale recipient fee fails closed;
- beta accepted/observe endpoints accept an authorized message preflight and preserve exact transaction observation;
- `profile` and `claim-rewards` remain unavailable in beta;
- beta Wall UI exposes both public and encrypted message composers;
- the accepted M16.2 post/comment and M16.3 weighted voting behavior remains unchanged.

## Frozen lanes

M16.4 does not authorize or change:

- production deployment or `HIVE_WRITE_MODE` activation;
- production environment variables;
- Cloudflare, DNS, TLS, Caddy, systemd, or Privex host state;
- Pay or Distriator activation;
- Hive writes or Keychain requests during candidate construction/CI;
- profile-setting writes or reward claims in beta;
- PR #1;
- the accepted M15 content-rendering corrections;
- the M16.2 post/comment or M16.3 weighted-vote protocol except for regression verification.

Integration and any later production activation require separate explicit authorization.
