# M1 foundation and safety boundary

M1 establishes a supported, testable, read-only base for the Hive-Bar rebuild. It deliberately does not restore login, blockchain writes, wallet ownership views, inbox decryption, payments, or QR handling.

## Fixed product identifiers

| Setting | M1 value |
| --- | --- |
| Hive community | `hive-108590` |
| Production threads container | `fourthst.threads` |
| Write mode | `disabled` |
| Runtime | Node.js 24 |

The LeoFinance community may be used only for explicitly configured read-only testing. It is not a production write target.

## Foundation controls

- A single validated configuration boundary rejects insecure RPC URLs, insufficient production RPC redundancy, invalid identifiers, and all write-enabled modes.
- `createApp()` is separate from `startServer()` so middleware, routes, health behavior, and startup can be tested without binding a port.
- Hive reads use native JSON-RPC through a rotating node pool with timeouts, response-size limits, node failover, and a small circuit breaker.
- EJS renders one valid document shell. HTMX is served locally, executable inline scripts and event handlers are prohibited, and stored Markdown passes through an explicit sanitizer allowlist.
- Helmet security headers, request size limits, parameter limits, rate limiting, request IDs, redacted structured logs, safe errors, liveness, and readiness checks are enabled centrally.
- The source tree contains no browser-side login, private-key, voting, posting, comment-writing, transfer, wallet-ownership, inbox-decryption, or QR-payment modules.
- CI runs the deterministic secret scan, lint, tests, CSS build, and production dependency audit on Node 24. The complete development and runtime tree also audits with zero known vulnerabilities at the M1 evidence point.

## Health endpoints

| Endpoint | Meaning | Hive dependency |
| --- | --- | --- |
| `GET /healthz` | The process and HTTP application are alive | None |
| `GET /readyz` | At least one configured Hive RPC node answers a current-properties read | Required |

Both responses disable caching. A failed readiness check returns `503` without disclosing internal node errors.

## Intentionally unavailable in M1

The following surfaces fail closed with a controlled `503 FEATURE_UNAVAILABLE` response or are absent from the shell:

- Keychain login and sessions;
- posts, threads, comments, votes, follows, and subscriptions that write to Hive;
- owner-only wallet, inbox, settings, rewards, and metadata changes;
- wall-post writes and transaction classification;
- QR intake, transfers, receipts, and Distriator handoff.

No M1 path signs or broadcasts a Hive operation.

## Verification

Run the complete local gate from a clean checkout:

```sh
npm ci --ignore-scripts
npm run check
```

The gate must pass before M1 is accepted or M2 work begins. Live read-only smoke checks are separate from the deterministic test suite because public RPC health is external and can be transient.

See `M1_ACCEPTANCE_EVIDENCE.md` for the deliverable-to-test matrix and recorded gate results.
