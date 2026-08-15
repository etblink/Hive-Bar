# M10 bar-operator posting mode

## Purpose

M10 turns the one-time M9 proof into a reversible bar-operator prototype. It
allows only `@fourthstreetbar` to prepare community-root posts for
`hive-108590`. The browser still obtains every Posting signature from the
operator's local Hive Keychain; the server never receives or stores a private
key.

## Exact scope

The accepted mode requires all of the following:

- `HIVE_WRITE_MODE=controlled`;
- `HIVE_CONTROLLED_ACCOUNTS=fourthstreetbar`;
- `HIVE_CONTROLLED_ACTIONS=post`;
- `HIVE_SIGNER_MODE=keychain`;
- a canonical `https://fourthstreetbar.com` origin, loopback application
  listener, and at least three read-only Hive RPC nodes;
- `DISTRIATOR_ENABLED=false` and no enabled payment configuration;
- `HIVE_M9_PILOT_CONTROL_PATH` absent; and
- a future finite M10 deadline no more than 24 hours away.

Any account, action, signer, topology, payment, or deadline deviation makes
the M10 startup gate refuse the service.

## Arming and expiry

Deployment will set these explicit values in the protected environment file:

```text
HIVE_M10_OPERATOR_ARMED_UNTIL=<UTC ISO-8601 instant, no more than 24h away>
HIVE_M10_OPERATOR_AUDIT_PATH=/var/lib/hive-bar/audit/m10-operator-audit.ndjson
```

The application checks the deadline at render and at every protected write
request. Once expired, it hides the post control and rejects preflight before
any Hive RPC or Keychain interaction. Restarting with a new deadline is a
separate, authorized deployment action.

## Audit trail

For M10 mode only, the application appends mode `0600` newline-delimited JSON
records to the configured regular audit file. Each record contains only event
time, account, action, authority, operation fingerprint, and transaction id
when Keychain supplied one. It does not record post body, cookies, signatures,
or private keys.

Events are `prepared`, `cancelled`, `keychain_accepted`, and `observed`.
There is no broadcast retry and no observation retry mechanism.

## Local disable and rollback

The source includes an explicit disable utility:

```text
node scripts/disable-m10-bar-operator.js --apply /absolute/path/to/hive-bar.env
```

It atomically sets `HIVE_WRITE_MODE=disabled`, clears the controlled account,
action, arming, and audit settings, and sets `HIVE_SIGNER_MODE=disabled`.
It refuses a relative path, symlink, or non-regular target. A future deployment
bundle must run it with the approved protected environment path and restart the
application in a separately authorized operation.
