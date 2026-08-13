# M6 public read-only release readiness

Status: **local Privex operations package implemented; deployment not authorized.** M5 technical preparation is complete, while its genuine-purchase gate is dormant. M6 begins with a public read-only release profile and does not enable any Hive write, payment, Keychain request, or Distriator claim.

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

## Bound hosting target

The first target is one Privex `V1-US-NVME` instance in US West running Debian 12. The recorded reference configuration is one virtual CPU, 1 GiB memory, 20 GiB NVMe storage, 100 Mbps networking, and both IPv4 and IPv6. The recorded price was USD 10 per month on 2026-08-13 and must be rechecked before any separately authorized purchase.

Privex offers stronger Hive ecosystem alignment and direct HIVE/HBD procurement than the earlier managed-platform option, but it is an unmanaged VPS. Hive-Bar therefore owns operating-system patching, TLS/reverse-proxy configuration, monitoring, release retention, rollback, and backups. This tradeoff is accepted only for the narrow single-instance read-only topology; it does not authorize procurement or deployment.

The target contract is machine-readable in `ops/privex/manifest.json`. `npm run release:check:privex` layers these requirements onto the generic gate:

- a canonical lowercase DNS host and exactly matching HTTPS `APP_ORIGIN`;
- Node bound only to `127.0.0.1:3000`;
- exactly one trusted reverse-proxy hop;
- Caddy as the only public listener;
- an inert `:memory:` payment receipt database; and
- a non-placeholder session secret.

`npm run start:privex` validates the same contract before opening the listener. It makes no Hive request during its release check.

## Deterministic controls

| Control | Evidence |
| --- | --- |
| Explicit profile | `src/release/read-only-readiness.js` rejects missing release-specific decisions even when application defaults would otherwise be safe |
| Write boundary | Release gate requires `disabled`, zero controlled accounts, `writesEnabled=false`, and `payments.enabled=false` |
| Cashback boundary | Release gate requires `DISTRIATOR_ENABLED=false` |
| Production transport | Existing configuration requires HTTPS origin and three distinct credential-free HTTPS RPC nodes |
| Secret hygiene | Summary contains no session secret, credential, receipt path, or RPC URL |
| Operator entrypoint | `scripts/check-read-only-release.js` and `npm run start:read-only` use the same validated configuration as the application |
| Privex target gate | `src/release/privex-readiness.js` binds host, origin, listener, proxy, port, receipt database, and placeholder-secret rejection |
| Runtime provenance | `ops/privex/bin/hive-bar-install-node` downloads Node v24.19.0 from nodejs.org and verifies the pinned Linux x64 SHA-256 before installation |
| Public boundary | Caddy terminates TLS; Node listens on loopback; port 3000 is not a public service |
| Service hardening | systemd runs an unprivileged static account with a read-only system view, empty capabilities, isolated temporary/devices, and bounded restart behavior |
| Manual release control | Deploy and rollback require one exact full commit, validate stored commit/tree identity, rerun the Privex gate, and restore the prior symlink if health fails |
| Operations | Local liveness timer, critical journal signal, seven-day/256 MiB journal bounds, and unattended Debian security updates are explicit assets |
| Regression suite | LF/CRLF CI, source-safety, configuration, browser, HTTP, accessibility, receipt, and exact-operation tests remain in the full gate |

## Local deterministic validation

On 2026-08-13, the complete local `npm run check` gate passed on the prepared tree: the credential scan passed, ESLint passed with zero warnings, production CSS rebuilt deterministically, all 154 tests passed, and the production dependency audit reported zero vulnerabilities. The new tests exercise the redacted target gate, every material fail-closed topology deviation, CLI error hygiene, provider/runtime provenance, loopback and systemd controls, exact-commit deployment/rollback structure, LF enforcement, and POSIX shell syntax. No live Hive read, Keychain request, Hive operation, hosting action, DNS change, or deployment occurred.

## Deployment topology decision

The first release must be a single application instance. Sessions, challenges, social preflights, and rate-limit counters are process-local; the SQLite receipt store is also designed for a narrow single-instance controlled flow. Horizontal scaling, rolling multi-instance deployment, or shared session state requires a later storage/topology design and must not be inferred from this plan.

Because the read-only profile cannot prepare a payment, `:memory:` is an acceptable inert receipt database for the initial public release. Before any controlled write profile is deployed, the existing durable-path requirement applies and persistence, backup, restore, and file permissions must be rehearsed separately.

## Remaining release gates

No deployment is authorized by this document. Before a public read-only release, record all of the following in one candidate-bound run:

1. a canonical production hostname and the exact current Privex package, region, price, terms, and backup decision;
2. product-owner authorization to procure infrastructure and later mutate DNS/TLS, each kept separate from a release authorization;
3. secret injection and rotation without exposing the secret in logs or shell history;
4. deterministic cross-platform CI and both release gates on one exact candidate;
5. startup, `/healthz`, `/readyz`, graceful shutdown, timer failure, restart, and rollback evidence on the target topology;
6. a read-only live smoke only if separately authorized, with the RPC transport write allowlist still enforced;
7. confirmation that controlled writes, Pay Tab preparation, and Distriator remain unavailable in the rendered production UI; and
8. an explicit product-owner release decision bound to the exact commit, tree, host, and environment fingerprint.

## Explicit non-goals

- no production or controlled Hive write mode;
- no Keychain preparation or signature request;
- no Hive transfer, payment, reward claim, profile update, social write, or retry;
- no Distriator claim or enablement;
- no production payment-ceiling decision;
- no deployment, domain, DNS, TLS, hosting, or secret mutation; and
- no claim that dormant M5 acceptance has been completed.

M6 can proceed locally through deterministic release hardening while the genuine-purchase gate remains dormant. Any external deployment or live-read validation requires a separately bounded authorization.
