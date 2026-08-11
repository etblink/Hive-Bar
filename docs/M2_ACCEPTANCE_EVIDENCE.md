# M2 acceptance evidence

Status: implementation candidate complete; product-owner acceptance and a network-capable live smoke remain pending

Baseline: Hive-Bar V1 acceptance specification 0.1.2

Evidence date: 2026-08-11

Branch: `codex/m2-read-only-slice`

Accepted M1 parent: `ab4a036`

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
| Live read-only smoke | `scripts/live-read-smoke.js`; manual workflow job | transport allowlist prevents broadcasts; network-capable execution still pending |
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

## Live integration status

The explicit read-only command was attempted from this workspace:

```sh
HIVE_RPC_TIMEOUT_MS=2000 LOG_LEVEL=silent npm run smoke:live
```

All three public RPC nodes were unreachable from the command environment, and the pool returned the expected safe `Hive data is temporarily unavailable` failure after bounded failover. No Hive write method is present in the allowlist and no write was attempted.

This is not recorded as a live pass. The repository includes a manual `workflow_dispatch` job that runs the same read-only smoke after the deterministic gate from GitHub Actions. M2 should not be product-owner accepted until that job (or an equivalent network-capable local run) passes and its report is recorded here.

## Remaining acceptance steps

1. Run the manual live read-only job after this branch is available on GitHub, or run `npm run smoke:live` from a network that can reach a configured Hive node.
2. Record the head block, observed community post count, thread-container state, sampled author/discussion, and wallet timestamp emitted by the script.
3. Perform a brief product-owner visual review of the landing, one-post community, full post, profile, and wallet views.
4. Accept M2 explicitly before M3 implementation begins.

## Boundary confirmation

M2 never signs or broadcasts. `hive-108590` remains the only production community, and `fourthst.threads` remains the production thread-container account. LeoFinance is not used by runtime code or deterministic fixtures.
