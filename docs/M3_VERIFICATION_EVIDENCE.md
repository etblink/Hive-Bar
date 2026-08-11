# M3 verification evidence

Status: local implementation candidate; deterministic verification passed; no live social write has been performed

Baseline: Hive-Bar V1 acceptance specification 0.1.3

Evidence date: 2026-08-11

Branch: `codex/m3-verified-identity-social-writes`

Accepted M2 parent: `e9237f1e8c7e824c7c938a5e7676e41639dfe04d`

## Deliverable evidence

| M3 deliverable | Implementation evidence | Deterministic evidence |
| --- | --- | --- |
| Single-use signed login | `src/auth/**`, `routes/auth.js` | success, replay, expiry, account mismatch, malformed signature, invalid origin |
| Current posting authority | `src/hive/posting-authority.js` | direct key, delegated account authority, threshold, and cycle bounds |
| Secure session | opaque server-side store and session middleware | HttpOnly/SameSite cookie, expiry, logout, CSRF, and foreign-session rejection |
| Normalized Keychain adapter | `public/js/keychain-adapter.js` | sign/broadcast call shape; absent, locked, cancelled, mismatch, and malformed response states |
| Eight operation builders | `src/hive/social-operations.js` | exact literal golden vectors for post, thread, comment, vote, follow, unfollow, subscribe, unsubscribe |
| Validation and counters | builder limits plus controlled forms | multibyte UTF-8 boundaries, tag/permlink/percentage validation, visible counters |
| Preflight and duplicates | `src/social/preflight-store.js`, `routes/social.js` | session binding, exact review, duplicate rejection, cancellation release, expiry |
| Acceptance and observation | preflight state machine plus `observeSocialOperation()` | transaction-id capture, pending state, content/vote/follow/subscription observations |
| Mocked browser journeys | `public/js/social-actions.js` | review cancel, Keychain cancel, accepted-then-observed, accepted-but-pending |
| Default no-write boundary | disabled config and unchanged RPC read allowlist | controlled account gate; normal UI and API fail closed; no broadcast RPC method |

## Final deterministic gate

- `git diff --check`: passed.
- `npm run check`: passed.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: lockfile consistency passed.
- Secret scan: passed across 107 tracked and candidate files.
- ESLint: passed with zero warnings.
- Production CSS build: passed.
- Automated tests: 81 passed, 0 failed.
- Exact operation golden vectors: all eight actions passed.
- Public and controlled M3 documents: structural HTML validation passed.
- axe serious/critical violations: 0 across key public and controlled social documents; primary contrast pairs are covered separately.
- 360 CSS-pixel responsive contract and reduced-motion CSS: passed.
- Stored-XSS and unsafe metadata corpus: blocked in executable contexts.
- Browser identity-storage scan and server private-key/broadcast implementation scan: passed.
- RPC broadcast/unknown-method boundary: blocked before Fetch.
- Production dependency audit: 0 vulnerabilities.

## Live-write status

No M3 live write is authorized by this candidate or has been attempted from it. Each first controlled operation requires the separate authorization and procedure in [M3_CONTROLLED_WRITE_RUNBOOK.md](M3_CONTROLLED_WRITE_RUNBOOK.md).
