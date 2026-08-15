# M13.0 — Source of Truth and Bar-Pilot Readiness

## Accepted baseline and scope

This reconciliation is an offline-only local repository action. Its baseline is the
accepted M6 lineage (`857e6c09227f498914e2132dfa6cb1ed15bbd10f`) and the deployed
candidate history through M12. It makes no server, Hive, Keychain, DNS, Cloudflare,
TLS, Caddy, payment, or GitHub change.

The consolidated local source implements and tests:

- M9: exact-review, post-only controlled publishing, with no server-side private key;
- M10: finite operator arming, explicit disable, and protected audit records;
- M11: bounded read-only official community feed;
- M12: delegated Posting-only pilot controls, expiry/restoration, and narrow audit write path.

## Operational state after M12 freeze

- Public application: Cloudflare → Caddy → loopback-only application.
- Public content reads are enabled; application writes are disabled by default.
- No Posting account delegates remain on `@fourthstreetbar` after the successful
  `@fartman69` development delegation/revocation test.
- `@fourthstreetbar` is the merchant/author account. Bar management uses a browser
  containing only its Posting key. Staff use their own Hive accounts only when a
  separately reviewed, explicitly time-bounded delegation and operator window are active.
- Owner, Active, and Memo keys must never be placed in staff browsers or application configuration.

## Management runbook

1. Confirm `/healthz` reports write mode `disabled` before any change.
2. Grant only the named staff account Posting authority through a management-controlled
   Keychain review; verify the exact authority read-back.
3. Activate one short, explicitly expiring `post-only` window for that one account.
4. Review one exact community-root `comment` operation before Keychain opens. Reject any
   operation containing transfer, memo, vote, follow, subscription, profile, wall, inbox,
   or non-community-root content.
5. After observation, cancel, or expiry, verify disabled mode and revoke the delegation.

## Rollback runbook

1. Use the explicit window/operator disable control immediately.
2. Verify the environment restoration, disabled write mode, no latent configuration,
   inactive expiry supervisor, loopback-only app binding, and direct-origin denial.
3. Revoke the named staff Posting delegation and verify `account_auths` is empty.
4. If any restoration verifier refuses, do not retry a Hive action; use the accepted
   read-only recovery path and preserve its evidence.

## Gate result

`npm run check` passed: secret scan, lint, CSS build, 179 tests, and production
dependency audit (0 high vulnerabilities).

## Next controlled milestone

M13.1 may create one local integration commit and then seek separate authorization for
remote publication/CI. M13.2, if accepted, deploys only that exact committed tree and
performs a fresh read-only verification before any new operator window.
