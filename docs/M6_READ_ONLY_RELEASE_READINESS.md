# M6 public read-only release readiness

Status: **local foundation implemented; deployment not authorized.** M5 technical preparation is complete, while its genuine-purchase gate is dormant. M6 begins with a public read-only release profile and does not enable any Hive write, payment, Keychain request, or Distriator claim.

Planning date: 2026-08-13

Frozen specification: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Published M5 documentation baseline: equivalent commit `2b1fbffccf76f874e056401988f4c3d2e1b97c53`; tree `9db2ad48413b4a3f1148192e3efe0b1c14034d74`

## Why this is the next non-payment milestone

M1 through M4 are accepted, and M5's deterministic implementation, cross-platform CI, current-V4V compatibility, physical-camera preparation, and public business-listing checks are complete. A synthetic payment must not be used to force the remaining M5 exit gate. The next independent work is therefore to make the already useful public application deployable with every write surface disabled.

This slice does not resolve the future production payment ceiling or authorize `HIVE_WRITE_MODE=production`. Those decisions remain outside the public read-only release.

## Release profile

The first M6 profile is `public-read-only`:

- `NODE_ENV=production`;
- `HIVE_WRITE_MODE=disabled`;
- `HIVE_CONTROLLED_ACCOUNTS` explicitly present and empty;
- payment preparation disabled as a consequence of write-disabled mode;
- `DISTRIATOR_ENABLED=false`;
- an explicit HTTPS `APP_ORIGIN` and explicit 32-byte-or-longer session secret;
- at least three distinct credential-free HTTPS Hive RPC nodes;
- explicit `TRUST_PROXY` and `LOG_LEVEL` operator decisions; and
- no private key, server broadcast method, automatic retry, or decrypted inbox plaintext.

`npm run release:check:read-only` validates the actual process environment without making a network request and prints only a redacted release summary. `npm run start:read-only` runs that gate immediately before server startup. The standard `npm start` remains available for controlled local procedures and is not reinterpreted as a release command.

## Deterministic controls

| Control | Evidence |
| --- | --- |
| Explicit profile | `src/release/read-only-readiness.js` rejects missing release-specific decisions even when application defaults would otherwise be safe |
| Write boundary | Release gate requires `disabled`, zero controlled accounts, `writesEnabled=false`, and `payments.enabled=false` |
| Cashback boundary | Release gate requires `DISTRIATOR_ENABLED=false` |
| Production transport | Existing configuration requires HTTPS origin and three distinct credential-free HTTPS RPC nodes |
| Secret hygiene | Summary contains no session secret, credential, receipt path, or RPC URL |
| Operator entrypoint | `scripts/check-read-only-release.js` and `npm run start:read-only` use the same validated configuration as the application |
| Regression suite | LF/CRLF CI, source-safety, configuration, browser, HTTP, accessibility, receipt, and exact-operation tests remain in the full gate |

## Deployment topology decision

The first release must be a single application instance. Sessions, challenges, social preflights, and rate-limit counters are process-local; the SQLite receipt store is also designed for a narrow single-instance controlled flow. Horizontal scaling, rolling multi-instance deployment, or shared session state requires a later storage/topology design and must not be inferred from this plan.

Because the read-only profile cannot prepare a payment, `:memory:` is an acceptable inert receipt database for the initial public release. Before any controlled write profile is deployed, the existing durable-path requirement applies and persistence, backup, restore, and file permissions must be rehearsed separately.

## Remaining release gates

No deployment is authorized by this document. Before a public read-only release, record all of the following in one candidate-bound run:

1. the chosen hosting target, canonical HTTPS origin, TLS termination, and explicit `TRUST_PROXY` value;
2. secret injection and rotation procedure without exposing the secret in logs or shell history;
3. `npm ci --ignore-scripts`, explicit pinned patch application, deterministic cross-platform CI, and `release:check:read-only` on the exact candidate;
4. startup, `/healthz`, `/readyz`, graceful shutdown, and restart evidence on the target topology;
5. a read-only live smoke only if separately authorized, with the RPC transport write allowlist still enforced;
6. log retention, alerting, rollback to an exact commit, and a maintenance/incident owner;
7. confirmation that controlled writes, Pay Tab preparation, and Distriator remain unavailable in the rendered production UI; and
8. an explicit product-owner release decision.

## Explicit non-goals

- no production or controlled Hive write mode;
- no Keychain preparation or signature request;
- no Hive transfer, payment, reward claim, profile update, social write, or retry;
- no Distriator claim or enablement;
- no production payment-ceiling decision;
- no deployment, domain, DNS, TLS, hosting, or secret mutation; and
- no claim that dormant M5 acceptance has been completed.

M6 can proceed locally through deterministic release hardening while the genuine-purchase gate remains dormant. Any external deployment or live-read validation requires a separately bounded authorization.
