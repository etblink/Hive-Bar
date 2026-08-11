# M2 acceptance evidence

Status: accepted by product owner; network-capable live smoke passed

Baseline: Hive-Bar V1 acceptance specification 0.1.2

Evidence date: 2026-08-11

Branch: `codex/m2-read-only-slice`

Accepted M1 parent: `ab4a036`

Accepted local M2 commit: `e9237f1e8c7e824c7c938a5e7676e41639dfe04d`

Published draft PR #1 head: `9085e9d00d73f61e0ea0b450832f28ac782ef36d`

Published exact M2 tree: `79ef17c76bc13d1529fae60f6eb102b8620c51d1`

## Deliverable evidence

| M2 deliverable | Implementation evidence | Verification evidence |
| --- | --- | --- |
| Truthful landing page | `views/pages/home/**`, validated business configuration | HTTP assertions for current address/phone/hours; tests reject old stock URLs and fabricated reviews |
| Community info and one-post sparse layout | `HiveReadService.getCommunity*`, community views | Exact one-post fixture route test; no loading shell or substitute community |
| Threads and empty container | `getLatestThreads()`, thread sparse view | `fourthst.threads` fixture returns no post and renders intentional container guidance |
| Sort and pagination | validated sorts, bounded anchor cursors, regular/HTMX navigation | inclusive-anchor removal, look-ahead, next-cursor, malformed-cursor, and batched-profile tests |
| Full posts and comments | Bridge flattened discussion normalization and full/fragment routes | direct-document and HTMX tests; chronological reply-depth test |
| Public profiles and blogs | Bridge profile/account-post normalization | escaped hostile metadata, safe image fallback, counts, posts, and missing-account behavior |
| Wallet reads | `src/hive/wallet.js` | fixed snapshot independently resolves to 550 HP, 70% voting power, and 60% RC |
| Beer visuals and milestones | accessible pitcher/meters and one milestone table | seven-of-ten segment rendering, exact numeric text, threshold continuity and boundary tests |
| Deterministic fixtures | `test/fixtures/hive/m2-read-slice.json` and fixture adapter | all functional tests run without network or a live-community fallback |
| Live read-only smoke | `scripts/live-read-smoke.js`; manual workflow job | GitHub Actions run `31539000319` passed against the configured production targets |
| Accessibility and responsive checks | semantic complete documents and responsive Tailwind/CSS | html-validate, axe serious/critical, contrast-pair, reduced-motion, and 360px contract tests |
| M2 no-write boundary | `src/hive/read-methods.js`, disabled configuration | broadcast and unknown methods rejected before Fetch; disabled HTTP write test |

## Current deterministic gate results

- Clean `npm ci --ignore-scripts --no-fund`: pass.
- `npm run check`: pass.
- Automated tests: 47 passed, 0 failed.
- Key documents checked: landing, community, full post, profile, and wallet.
- axe serious/critical violations: 0 on all key documents; color contrast is covered separately by tested primary token pairs.
- HTML structural validation: pass on all key documents.
- 360 CSS-pixel responsive contract and reduced-motion CSS: pass.
- Stored-XSS sanitizer corpus plus route-level hostile fixture: blocked in executable contexts.
- RPC write/unknown-method policy: blocked before any Fetch call.
- Lint and production CSS build: pass.
- Repository secret scan: pass (92 files checked).
- Full development/runtime audit: 0 vulnerabilities.
- Production-only audit: 0 vulnerabilities.
- `git diff --check`: pass.

## Live integration result

GitHub Actions run `31539000319` completed successfully in a network-capable environment. It observed head block `108941408`, the one-post `hive-108590` production shape, and the configured `fourthst.threads` account with no thread-container posts at the observation time. `HIVE_WRITE_MODE` remained `disabled`, and the transport read allowlist made broadcasting impossible.

The temporary validation PR #2 was closed without merge after the run. Draft PR #1 remains unchanged and unmerged. The product owner subsequently accepted M2 and authorized M3.

## Boundary confirmation

M2 never signs or broadcasts. `hive-108590` remains the only production community, and `fourthst.threads` remains the production thread-container account. LeoFinance is not used by runtime code or deterministic fixtures.
