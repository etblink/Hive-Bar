# M14.1 — Payment isolation, irreversible confirmation, and exact Privex release gate

## Baseline

M14.1 is based on accepted M13.3 commit `e33c8c2281e908db3fdeb220d0b314d6ecbb21c2`, tree `9cb7540e34af2d41ad4cf4acfbd63d31c2d49b82`.

This milestone is implementation and deterministic verification only. It does not authorize deployment, a Hive or Keychain operation, a payment, a V4V invoice generation, a Distriator claim, DNS/Cloudflare/TLS/Caddy changes, or modification of PR #1.

## Payment authorization isolation

Patron HBD payment is an Active-authority operation and is no longer routed through the M10/M12 Posting-operator middleware. The payment router requires:

- a current verified server session;
- same-origin and CSRF protection;
- `HIVE_WRITE_MODE=controlled`;
- the session account in the explicit controlled-account allowlist;
- the exact `payment` action enabled; and
- an enabled merchant-bound payment configuration.

M10 finite Posting arming and M12 delegated Posting identity are deliberately irrelevant to this request path. No staff Posting delegation can authorize a payment and no expired Posting window can block a separately authorized patron payment.

## Irreversible settlement rule

A transaction merely observed in a reversible Hive block remains pending. The observer now queries each configured independent node for both:

1. the exact transaction, including reversible blocks; and
2. `last_irreversible_block_num` from dynamic global properties.

`ChainConfirmed` / **Paid** requires at least two independent nodes to:

- return the exact same transaction id and operation;
- agree on its block/index/timestamp location; and
- report `last_irreversible_block_num >= transaction.block_num`.

One-node observation, reversible-only observation, node errors, mismatches, or location disagreement never produce **Paid** and never authorize an automatic retry.

## Exact Privex payment release profile

`assertPrivexControlledPayment` is the fail-closed M14 production gate. It requires:

- `NODE_ENV=production`;
- canonical `https://fourthstreetbar.com` Cloudflare → Caddy → loopback topology;
- `HIVE_WRITE_MODE=controlled`;
- exactly one verified payer in `HIVE_CONTROLLED_ACCOUNTS`;
- exactly `HIVE_CONTROLLED_ACTIONS=payment`;
- `HIVE_SIGNER_MODE=keychain`;
- merchant exactly `fourthstreetbar`;
- controlled maximum exactly `1.000 HBD`;
- durable database exactly `/var/lib/hive-bar/payments/receipts.sqlite3`;
- at least three Hive RPC nodes;
- `DISTRIATOR_ENABLED=false`; and
- no M9, M10, or M12 Posting-control residue.

`start-privex.js` recognizes this profile only when the controlled action list is exactly `[payment]`. Mixed payment/posting action sets cannot select the M14 gate.

## Durable storage preparation

The repository adds `ops/privex/bin/hive-bar-prepare-payment-storage`, which creates `/var/lib/hive-bar/payments` as `hivebar:hivebar` mode `0700` and refuses symlinked storage. If the SQLite file already exists it must be a regular non-symlink file and is normalized to mode `0600`.

The repository also adds `ops/privex/hive-bar-payment.service.d/10-payment-storage.conf`, allowing the hardened service to write only the existing audit directory plus the new payment directory.

These are preparation artifacts only. M14.1 does not install the drop-in, execute the storage script, edit `/etc/hive-bar/hive-bar.env`, restart systemd, or alter the accepted read-only deployment script.

## Distriator boundary

Distriator remains disabled for the initial M14 payment profile. A chain-confirmed genuine purchase is not by itself evidence of current rebate eligibility. Any later cashback/claim integration requires separate verification and authorization.

## Genuine-purchase boundary

The prior policy remains controlling: do not manufacture a payment to satisfy a milestone. A future live gate must arise from a genuine purchase and use a fresh current invoice. That gate must separately bind the then-accepted commit/tree, payer, merchant, exact amount, memo, operation JSON, fingerprint, and one Active Keychain request. No such authorization is created by M14.1.

## M14.1 acceptance evidence required

Before M14.1 can be accepted:

- full deterministic tests must pass on Ubuntu and Windows under Node `24.19.0` / npm `11.17.0`;
- secret scan, zero-warning lint, production CSS build, and high-severity production dependency audit must pass;
- payment tests must prove Posting-window/delegation isolation;
- observer tests must prove reversible observations remain pending and two-node irreversible observations alone become confirmed;
- release tests must reject extra payers, extra actions, wrong signer mode, wrong merchant/ceiling/storage, enabled Distriator, and M9/M10/M12 residue; and
- no live-read smoke or external operation is required or authorized.

M14.2, if separately accepted, may publish/integrate the exact candidate and define a separately reviewed deployment preparation. A genuine customer payment remains later still.
