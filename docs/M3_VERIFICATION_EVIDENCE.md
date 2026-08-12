# M3 verification evidence

Status: complete; deterministic verification passed; one individually authorized controlled subscribe pilot completed, observed irreversibly on Hive, and cleaned up; normal write mode remains disabled

Baseline: Hive-Bar V1 acceptance specification 0.1.3

Evidence date: 2026-08-12

Branch: `codex/m3-verified-identity-social-writes`

Verified remote commit: `2949d1175075785bd925ba502a55fda43d11f6ba`

Verified remote tree: `5a272fc98c0b8de4c9f359b9a2e55db162e4ce11`

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
- Automated tests: 82 passed, 0 failed.
- Exact operation golden vectors: all eight actions passed.
- Public and controlled M3 documents: structural HTML validation passed.
- axe serious/critical violations: 0 across key public and controlled social documents; primary contrast pairs are covered separately.
- 360 CSS-pixel responsive contract and reduced-motion CSS: passed.
- Stored-XSS and unsafe metadata corpus: blocked in executable contexts.
- Browser identity-storage scan and server private-key/broadcast implementation scan: passed.
- RPC broadcast/unknown-method boundary: blocked before Fetch.
- Production dependency audit: 0 vulnerabilities.

## Live-write status

One M3 controlled pilot operation was individually authorized and completed. This evidence does not authorize another operation, another account, production write mode, or a financial action.

| Evidence field | Recorded result |
| --- | --- |
| Authorization | Product-owner instruction recorded 2026-08-11 22:32 UTC: `Authorize @fartman69 to subscribe to hive-108590.` |
| Candidate | Remote commit `2949d1175075785bd925ba502a55fda43d11f6ba`; tree `5a272fc98c0b8de4c9f359b9a2e55db162e4ce11`; fingerprint-review safety test included |
| Account/action/target | `fartman69`; Posting-authority `subscribe`; community `hive-108590` (`4th Street Bar`) |
| Pre-state | `bridge.get_community` reported `subscribed: false`, role `guest`, and 2 subscribers at 2026-08-11 22:32:51 UTC |
| Exact operation | `custom_json`, id `community`, `required_posting_auths: ["fartman69"]`, JSON `["subscribe",{"community":"hive-108590"}]` |
| Fingerprint | `ed222513cb5e6c7cdff06c24fdb02cc9ef3f8d6a171e2446d0848f02ab017278` |
| Transaction | `05c8f69c668b144f52d491a0d659fdf3309e0cfc`; block `108944428`; transaction index 13; operation index 0; timestamp 2026-08-12 00:12:45 UTC |
| Observation | Exact transaction and account history matched; `bridge.get_community` reported `subscribed: true` and 3 subscribers at 2026-08-12 00:18:37 UTC |
| Finality | Transaction block `108944428` was below last irreversible block `108944542` at observation |
| Key custody | Hive-Bar received no password, private key, WIF, seed phrase, Keychain export, or signing authority; the user confirmed in local Hive Keychain |
| Cleanup | Operator confirmed at 2026-08-12 00:26:52 UTC that the local process was stopped and the process-scoped controlled-mode environment was cleaned up |

All subsequent controlled operations still require a new, exact authorization and the complete procedure in [M3_CONTROLLED_WRITE_RUNBOOK.md](M3_CONTROLLED_WRITE_RUNBOOK.md). `HIVE_WRITE_MODE=disabled` remains the repository default, and M3 still rejects `HIVE_WRITE_MODE=production`.
