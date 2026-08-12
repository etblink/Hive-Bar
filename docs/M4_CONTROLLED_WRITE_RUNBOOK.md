# M4 controlled-write runbook

This runbook is mandatory for every M4 live operation. M4 implementation authorization and deterministic tests do not authorize any profile update, reward claim, wall transfer, or inbox transfer.

## Hard prerequisites

- Obtain a new product-owner instruction naming exactly one account and one action. For wall or inbox, it must also name the recipient, amount or approved minimum, and intended message.
- Confirm the candidate commit is clean and `npm run check` passes from that exact source.
- Confirm the account is available in the operator's local Hive Keychain. Never request or accept a password, master key, private key, WIF, seed phrase, or Keychain export.
- For wall and inbox transfers, verify the account has sufficient HBD and re-read the recipient's current wall fee immediately before preflight.
- Confirm the configured server-global exclusions and the recipient's current profile-managed exclusions.
- Treat each authorization as consumed after one attempt. It cannot be reused for a retry or another action.

## One-operation environment

Start a fresh local process with only the authorized sender/account in the controlled allowlist:

```sh
NODE_ENV=development
APP_ORIGIN=http://localhost:3000
HIVE_WRITE_MODE=controlled
HIVE_CONTROLLED_ACCOUNTS=the-authorized-account
HIVE_WALL_DEFAULT_FEE=1.000 HBD
HIVE_GLOBAL_WALL_EXCLUSIONS=
SESSION_SECRET=replace-with-a-fresh-random-value-of-at-least-32-bytes
```

Set `HIVE_GLOBAL_WALL_EXCLUSIONS` only to accounts separately approved for the server-global policy. Do not add extra controlled accounts. Do not restart the process after preflight or Keychain acceptance because sessions, duplicate guards, and pending evidence are intentionally in memory.

## Per-operation review

| Action | Confirm before Keychain | Keychain authority |
| --- | --- | --- |
| Profile | current revision, exact owned-field diff, preserved unrelated metadata, full `account_update2` JSON | Posting |
| Claim rewards | exact current HIVE, HBD, and VESTS reward balances; at least one is non-zero | Posting |
| Wall | sender, recipient, amount, current minimum fee, public/permanent text, marker, full transfer JSON | Active |
| Inbox | sender, recipient, amount, current minimum fee, privacy disclosure, marked ciphertext transfer JSON | Memo encryption first, then Active |

For an inbox send, the first Keychain prompt encrypts the marked plaintext locally. Only after ciphertext preflight and exact review may the operator approve the Active-authority HBD transfer. Do not copy plaintext or decrypted content into logs, screenshots, tickets, chat, or evidence records.

## Execution procedure

1. Sign in through Hive-Bar's Keychain form and confirm the account and Posting signature prompt. The login signature does not authorize a transaction.
2. Open the authoritative target page and verify the current settings, rewards, fee, exclusions, recipient, and balance relevant to the one authorized action.
3. Fill only that action. For wall/inbox, do not silently raise the approved amount above the current minimum.
4. Capture the preflight account, action, authority, exact summary, exact operation JSON, and 64-character fingerprint.
5. Compare every field with the authorization. Cancel if any field differs.
6. Continue to Keychain. Inspect its account, authority, operation, recipient, asset, amount, and memo disclosure before confirming.
7. Record the transaction id returned by Keychain and the application log containing only account, action, fingerprint, and transaction id.
8. Wait for **exact operation observed in Hive block**. “Broadcast accepted” is pending, not completion.
9. Independently read the transaction and post-state. Record transaction id, block, operation, observation time, and whether the block is irreversible when checked.
10. Stop the local process, restore `HIVE_WRITE_MODE=disabled`, and clear the controlled account and any temporary global exclusion configuration.

## Stop conditions

Stop without retrying when:

- authorization is missing, ambiguous, already consumed, or names a different account/action/recipient/amount;
- the current wall fee differs from the reviewed fee;
- the sender is on either exclusion list;
- metadata changed, is malformed, or cannot be merged without preserving unrelated fields;
- reward balances are all zero or differ from the reviewed preflight;
- the account, authority, operation JSON, fingerprint, recipient, asset, amount, or marker differs;
- Keychain is absent, locked, cancelled, or reports an authority/account mismatch;
- Keychain accepted a broadcast but returned no transaction id;
- the application cannot record acceptance or cannot observe the exact transaction;
- the process restarts before observation;
- any requested action is an arbitrary transfer, tab payment, conversion, market order, delegation, power-up, power-down, or other operation outside M4.

An uncertain broadcast must be resolved through read-only chain inspection before a new authorization is requested. Never retry automatically.

## Evidence record

| Field | Required evidence |
| --- | --- |
| Authorization | exact instruction, account, action, target/amount where applicable, and time |
| Candidate | commit, tree, clean status, and deterministic gate result |
| Pre-state | current metadata revision/rewards/fee/exclusions as applicable |
| Preflight | account, authority, exact operation, summary, and fingerprint |
| Keychain | manual confirmation outcome; never keys, login signatures, or tokens |
| Transaction | transaction id or explicit missing-id uncertainty |
| Observation | exact RPC-matched operation, block, time, and finality check |
| Cleanup | process stopped, write mode disabled, temporary configuration cleared |

Do not record inbox plaintext or ciphertext, cookies, session ids, CSRF tokens, full request bodies, passwords, or any key material.
