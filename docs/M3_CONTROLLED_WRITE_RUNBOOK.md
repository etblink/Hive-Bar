# M3 controlled-write runbook

This runbook is mandatory for the first M3 live social writes. Completing the code or deterministic tests does not authorize a Hive write.

## Hard prerequisites

- Obtain explicit product-owner authorization for one named operation, one Hive account, and one target. Authorization is not reusable for the next operation.
- Confirm that the account is controlled by Evan and is available in the local Hive Keychain extension.
- Confirm the exact target: community `hive-108590`, current `fourthst.threads` container, content author/permlink, or follow account as applicable.
- Confirm `npm run check` passes from the exact candidate commit.
- Confirm the operation's golden-vector test and mocked browser journey pass.
- Do not use LeoFinance, `hive-167922`, `leothreads`, or another community as a write target.
- Do not paste a password, master key, private key, WIF, or Keychain export into chat, environment files, logs, or the application.

## One-operation environment

Start from a clean process with normal public RPC nodes and only the authorized account in the allowlist:

```sh
NODE_ENV=development
APP_ORIGIN=http://localhost:3000
HIVE_WRITE_MODE=controlled
HIVE_CONTROLLED_ACCOUNTS=the-authorized-account
SESSION_SECRET=a-fresh-random-secret-of-at-least-32-bytes
```

Do not add multiple accounts. Do not restart the process after a preflight is prepared or a broadcast is accepted; M3 sessions and duplicate records are intentionally server-memory state.

## Per-operation procedure

1. Sign in through the application's Keychain form. Read the account shown in both the page and Keychain prompt before confirming the Posting signature.
2. Open the authoritative target state and verify it is current. For threads, confirm the resolved `fourthst.threads` parent. For follow/subscription operations, confirm the current read state.
3. Fill only the single authorized action. Review the visible UTF-8 count and validation result.
4. Capture the preflight screen showing:
   - signing account;
   - Posting authority;
   - action and target;
   - vote percentage and exact integer weight when applicable;
   - exact operation JSON;
   - operation fingerprint.
5. Compare every field with the authorization. If anything differs, cancel before Keychain.
6. Continue to Keychain and inspect its account, authority, and operation. Confirm manually only if they match.
7. Preserve the transaction id emitted by Keychain and the structured application log containing account, action, fingerprint, and transaction id.
8. Wait for the application to report **observed through Hive RPC**. “Broadcast accepted” alone is not completion.
9. Independently re-open the authoritative Hive target and record the observed content/state.
10. Stop the application, restore `HIVE_WRITE_MODE=disabled`, and remove the controlled account allowlist before requesting authorization for another operation.

## Stop conditions

Stop without retrying if:

- the account, authority, target, parent, payload, percentage, or fingerprint differs;
- Keychain is absent, locked, cancelled, or reports an authority mismatch;
- the application reports a duplicate operation;
- Keychain accepted the broadcast but the application could not record it;
- Keychain supplied no transaction id (record the uncertainty and do not retry automatically);
- the process restarts before observation;
- Hive RPC cannot establish authoritative post-write state;
- any requested operation is financial or outside the eight M3 social actions.

An uncertain broadcast must be resolved by read-only chain inspection before any new authorization is requested.

## Evidence record

For each individually authorized operation, record:

| Field | Required evidence |
| --- | --- |
| Authorization | exact product-owner instruction and time |
| Candidate | commit and clean tree |
| Account/action/target | values shown in preflight and Keychain |
| Fingerprint | 64-character operation hash |
| Transaction | Keychain transaction id, or explicit missing-id incident |
| Observation | RPC-observed state and timestamp |
| Cleanup | process stopped and write mode restored to `disabled` |

Never record a password, private key, signed login challenge, session token, CSRF token, or full cookie.
