# M1 acceptance evidence

Status: accepted by the product owner on 2026-08-11

Baseline: Hive-Bar V1 specification 0.1.1

Evidence date: 2026-08-11

Branch: `codex/m1-foundation`

Accepted commit: `ab4a036`

## Deliverable evidence

| M1 deliverable | Implementation evidence | Verification evidence |
| --- | --- | --- |
| Supported pinned dependency tree on Node 24 | `.nvmrc`, exact versions in `package.json`, npm lockfile, current Tailwind CLI | `npm ls --depth=0`; full `npm audit --audit-level=high` reports zero vulnerabilities |
| Application/server separation | `src/app.js`, `src/server.js` | HTTP integration tests plus a real ephemeral TCP startup/shutdown test |
| Validated configuration and modes | `src/config.js`, `.env.example` | Defaults, identifier, URL, write-mode, redundancy, deep-freeze, and missing-production-setting tests |
| Repaired EJS/HTMX shell and local assets | `views/`, local `/htmx` static mount, `public/js/main.js` | Single-document shell test, local HTMX test, source safety scan, CSS build |
| RPC timeout and failover | `src/hive/rpc-pool.js` | JSON-RPC request, rotation, circuit, failover, invalid JSON, and streamed-size-limit tests |
| Sanitization and stored-XSS defense | `src/content/markdown.js` | `test/fixtures/stored-xss.json` corpus plus HTTPS-only link/image tests |
| Security headers and input limits | Helmet/CSP and parsers in `src/app.js` | Header, CSP, malformed JSON, body-size, and rate-limit integration tests |
| Validation, errors, and logs | `src/http/validation.js`, `src/middleware/errors.js`, `src/lib/logger.js` | Safe JSON/HTML errors, request IDs, no stack leakage, and credential-redaction tests |
| Health behavior | `src/routes/health.js` | Hive-free liveness, Hive-backed readiness, failure privacy, and no-cache tests |
| CI quality gate | `.github/workflows/ci.yml`, `scripts/check-secrets.js` | Node 24 workflow runs secret scan, lint, tests, build, and production audit |
| M1 write boundary | Disabled write mode plus removed legacy browser modules | Configuration rejection, disabled endpoint, absent-module, and no-inline-script tests |

## Gate results

- `npm run check`: pass.
- Automated tests: 32 passed, 0 failed.
- Stored-XSS corpus: 20 payloads blocked in executable contexts.
- `npm audit --audit-level=high`: 0 vulnerabilities across runtime and development dependencies.
- `npm audit --omit=dev --audit-level=high`: 0 production vulnerabilities.
- Repository secret scan: pass.
- `git diff --check`: pass.
- Production startup without explicit critical settings: refused with a configuration error.
- Production-mode TCP startup, hardened health response, and graceful shutdown: pass.

## Integration note

An outbound live Hive RPC smoke attempt from this workspace timed out because its command environment cannot reach the public RPC nodes. The JSON-RPC method and parameter forms were checked against the current official Hive API definitions, and all node behavior is covered deterministically with injected Fetch responses. M2 already requires live read-only smoke tests and remains the gate for validating real community, post, thread, and profile payloads.

## Boundary confirmation

M1 performs no live Hive writes. `hive-108590` is the configured production community and `fourthst.threads` is the configured production thread-container account. Login, signing, posting, voting, following, wallet ownership, inbox decryption, transfers, QR handling, and other write or owner-only features remain disabled for later milestones.
