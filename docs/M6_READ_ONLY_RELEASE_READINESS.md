# M6 public read-only release readiness

Status: **Privex public read-only readiness slice published and cross-platform validated; final business-content binding prepared locally; full M6 is not accepted.** M5 technical preparation is complete, while its genuine-purchase gate is dormant. M6 begins with a public read-only release profile and does not enable any Hive write, payment, Keychain request, or Distriator claim.

Planning date: 2026-08-13

Frozen specification: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Published M5 documentation baseline: equivalent commit `2b1fbffccf76f874e056401988f4c3d2e1b97c53`; tree `9db2ad48413b4a3f1148192e3efe0b1c14034d74`

Published M6 readiness candidate: equivalent commit `86f3edd5af9d4be0e606f2d1dfee4a81686ae839`; tree `39ab1213ffb9e9e1d78b75d60724fb73f6f42f13`; local equivalent `c8068899ec2593a053062f0705e7fd85925cd027`; patch SHA-256 `b7ddf7550532fd7ca1c4eb17d39b7381d9f9fb153208f75c072ac5200da1c58b`

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

## Publication and cross-platform CI evidence

The implementation was committed locally as `c8068899ec2593a053062f0705e7fd85925cd027`, with tree `39ab1213ffb9e9e1d78b75d60724fb73f6f42f13` and patch SHA-256 `b7ddf7550532fd7ca1c4eb17d39b7381d9f9fb153208f75c072ac5200da1c58b`. It was published as equivalent fast-forward child `86f3edd5af9d4be0e606f2d1dfee4a81686ae839` of expected remote head `9c3dac617432f24a92ad5f9d29c2d7bd728129a4`, preserving the exact tree.

Temporary trigger commit `eface8a2bf6583eabd61d82f97d4a3120cc3a2d4`, tree `425b2c5a010bb459772d4ad5054c8b36c0917617`, differed from the candidate only by adding `codex/m6-ci-validation` to the existing workflow push trigger. GitHub Actions run `31733537039` completed successfully on that exact trigger commit:

- Ubuntu Node 24 verification job `94559547889` passed;
- Windows Node 24 verification job `94559547754` passed; and
- live Hive read-only smoke job `94559832193` was skipped because the event was a push, not a manual dispatch.

Temporary branch `codex/m6-ci-validation` was deleted and independently verified absent. The M6 candidate branch remained at `86f3edd5af9d4be0e606f2d1dfee4a81686ae839`. PR #1 remained open and draft at its original `codex/m2-read-only-slice` head `9085e9d00d73f61e0ea0b450832f28ac782ef36d`. No live Hive read, Keychain request, Hive operation, payment, Privex purchase, deployment, DNS/TLS change, or secret mutation occurred.

## Local final business-content binding

On 2026-08-13, the product owner supplied and approved four real 4th Street Bar photographs and selected `fourthstreetbar.com` as the canonical application hostname. The raw files were converted locally to metadata-free JPEG assets with descriptive repository names; no EXIF, ICC, IPTC, Photoshop application segment, or JPEG comment is retained. Their candidate SHA-256 identities are:

| Asset | SHA-256 |
| --- | --- |
| `public/images/fourth-street-bar-bartender.jpg` | `aff6d1d746820f78cd659e658801cac0d20a2485e4b367d0c71eb14ee4a518fa` |
| `public/images/fourth-street-bar-exterior.jpg` | `585b3e80a50723b3cd0209b244f3a57efb14c018313f64ea34bd7f3108bc654a` |
| `public/images/fourth-street-bar-patio.jpg` | `c65d5c0c00ea9ff6ce556586285eeabfa02e255fb87569556a58621014f1e100` |
| `public/images/fourth-street-bar-pool-table.jpg` | `db6b18d3cb7f33778072fe980e6bfeade38e1e6c9aa895229d4b0ed4a687e18f` |

The owner supplied the application-tag pattern `fourth-street-bar-app-v#`. Because Hive-Bar's validated Hive metadata contract requires `name/x.y.z`, the candidate binds the version-matched exact tag `fourth-street-bar-app/0.1.0`. The production and Privex release gates require that exact tag, and the Privex gate requires the exact canonical host `fourthstreetbar.com`. This binding is local and uncommitted at the time of this record; it does not imply DNS ownership verification, publication, deployment, TLS issuance, or any external mutation.

## Final read-only M6 acceptance audit

The controlling specification defines M6 as the **Production candidate**, not merely an operations-package design. Its exit gate requires every V1 MUST requirement to pass or receive an explicit product-owner waiver, with no unresolved financial or security blocker. The 2026-08-13 audit therefore separates deterministic readiness from full M6 acceptance:

| M6 deliverable or exit condition | Current evidence | Audit result |
| --- | --- | --- |
| Real business content and final configuration | Name, address, telephone, hours, map, community, thread container, merchant, wall fee, claim URL, four metadata-free owner-approved photographs, canonical host `fourthstreetbar.com`, and exact application tag `fourth-street-bar-app/0.1.0` are bound locally. Publication and candidate validation remain pending. | **Prepared locally** |
| Production deployment and HTTPS | A fail-closed Privex/Caddy contract exists, but no VPS was purchased, server provisioned, DNS changed, certificate issued, or application deployed. | **Open — not run** |
| Durable store plus backup/restore check | The read-only profile deliberately binds the inert `:memory:` receipt store. No production durable volume, encrypted recovery record, backup, or restore rehearsal exists. | **Open — not run** |
| Monitoring, redacted logs, health checks, and rollback | Deterministic tests cover prepared systemd, journald, health-timer, exact-commit deploy, and rollback assets. None has been exercised on the target host. | **Prepared; target verification open** |
| Desktop/mobile physical-device acceptance | The separate M5 Windows camera preparation gate passed before Keychain, but no deployed M6 candidate has undergone desktop/mobile public-site acceptance or the required Android/iOS bar-floor checks. | **Open** |
| Operator and patron quick-start documentation | The Privex operator runbook and repository README exist. Final host-specific operator records and a deployed patron quick-start/bar-floor rehearsal do not. | **Partial** |
| Release checklist and known-limitations record | This readiness document, target manifest, runbook, explicit remaining gates, and this audit record the current boundaries without claiming deployment. | **Pass for the readiness slice** |
| Deterministic quality and security gates | Local `npm run check` passed 154/154 tests, credential scan, zero-warning lint, production build, and zero-vulnerability production audit. The same gate passed on Ubuntu and Windows remote CI. | **Pass** |
| Current candidate live-read integration | The CI live-read job was deliberately skipped. Earlier milestone evidence does not substitute for a candidate- and target-bound M6 live-read check. | **Open — not authorized** |
| Every V1 MUST requirement passing or waived | Production imagery/deployment/operations/device requirements remain open, and no waiver has been granted. | **Blocked** |
| No unresolved financial blocker | The frozen M5 genuine-purchase exit gate remains intentionally dormant; no real payment, exact chain confirmation, V4V/POS reconciliation, or product-owner waiver exists. | **Blocked** |

Audit disposition:

```text
M6_READ_ONLY_RELEASE_READINESS = PASS
M6_FULL_ACCEPTANCE = NOT_GRANTED
PRODUCTION_DEPLOYMENT = NOT_AUTHORIZED
```

This is not a regression or failed implementation. It is the truthful boundary between a validated, publishable operations package and the external evidence required by the approved M6 milestone. Full M6 acceptance must not be inferred from this document, and the dormant M5 financial gate must not be manufactured merely to advance the roadmap.

## Deployment topology decision

The first release must be a single application instance. Sessions, challenges, social preflights, and rate-limit counters are process-local; the SQLite receipt store is also designed for a narrow single-instance controlled flow. Horizontal scaling, rolling multi-instance deployment, or shared session state requires a later storage/topology design and must not be inferred from this plan.

Because the read-only profile cannot prepare a payment, `:memory:` is an acceptable inert receipt database for the initial public release. Before any controlled write profile is deployed, the existing durable-path requirement applies and persistence, backup, restore, and file permissions must be rehearsed separately.

## Remaining release gates

No deployment is authorized by this document. Before a public read-only release, record all of the following in one candidate-bound run:

1. the exact current Privex package, region, price, terms, and backup decision for the already bound canonical host;
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

The M6 read-only readiness slice is complete, and its final business inputs are now prepared locally. Full M6 remains open until this content binding is published and validated and its external gates are separately authorized, executed, and recorded, or the controlling specification is explicitly revised. Any purchase, deployment, DNS/TLS or secret mutation, live-read validation, Keychain request, Hive operation, payment, or waiver requires a separately bounded product-owner decision.
