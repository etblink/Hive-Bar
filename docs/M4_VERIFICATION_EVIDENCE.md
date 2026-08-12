# M4 verification evidence

Status: current deterministic candidate complete through GRF-06 remediation; controlled profile, reward-claim, and public-wall trials succeeded irreversibly; encrypted inbox trial pending separate authorization

Baseline: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Evidence date: 2026-08-12

Branch: `codex/m4-profiles-settings-rewards-wall-inbox`

Accepted M3 tree: `e444514f2d951c2d8c65b602bb45ff341e18ff04`

Published profile-trial candidate commit: `834ad81f3ed05fc6e5b8cd72c5d53a99bc430f68`

Published profile-trial candidate tree: `1a91f0eec191c03d8ad032acf0886cf59fa0cc77`

Post-trial stabilized published commit: `cf30f62bbdbf8d3126f77e8bd3a945f57077b11c`

Post-trial stabilized tree: `2c01f0eb2f8a10f388eb4e4007b16569ebaf3abd`

Current local GRF-06 remediation commit: `984c07bc5d25ebbad2afd6f11d3e717bd249eed5`

Current published code-candidate commit: `6e872c5e23d51d761a748b60125b87c154f95e2f`

Current local and published code-candidate tree: `19ac369c1d45880c3b084e08850ac21f84536520`

Local evidence and reward-trial candidate commit: `75cd0d4734c967d5147cf49ea248137cba1b9af5`

Published evidence and reward-trial candidate commit: `ef238f46010e55a34195cf30d235e85e267e6893`

Local and published reward-trial candidate tree: `c3647da5261a1a8a60b3bf7048eeb4c6cb65502f`

Local reward-evidence and wall-trial candidate commit: `cffae68d2ac6d68ed200585dc437fd7f44d4deaf`

Published reward-evidence and wall-trial candidate commit: `b23036e00a1eb84c5cfb0f0b35f474114c076d79`

Local and published wall-trial candidate tree: `278631302caa313710e162cfa45caa1bc9d90bae`

## Deliverable evidence

| M4 deliverable | Implementation evidence | Deterministic evidence |
| --- | --- | --- |
| Safe metadata lifecycle | `src/hive/profile-settings.js` | absent/empty/malformed reads; owned-field merge; unrelated-field preservation; stale/malformed/no-op/size guards; independent validation |
| Exact profile update | `src/hive/m4-operations.js`, `/api/m4/preflight/profile` | exact Posting-authority `account_update2`, empty legacy JSON field, merged posting JSON, inspectable diff |
| Followers/following and owner routes | `src/hive/read-service.js`, `src/http/validation.js`, `routes/profile.js`, profile partials | opaque bounded cursors; inclusive-anchor removal; batched profile reads with safe missing-profile fallback; full-page, HTMX, and legacy-fragment continuation links; malformed-cursor rejection before RPC; verified-owner-only inbox/settings; owner-only reward control |
| Accurate wallet and rewards | accepted wallet modules plus M4 reward builder | regenerated wallet fixture; exact current HIVE/HBD/VESTS claim; client substitution ignored; zero guard |
| Canonical assets | `src/hive/assets.js` | legacy and AppBase/NAI HIVE/HBD/VESTS values parsed with integer units and no floating-point currency math |
| Wall marker and filters | `src/hive/messages.js` | inbound/HBD/fee/marker/direction/exclusion corpus; unrelated, below-fee, outbound, service, inbox, and unmarked items rejected |
| Both exclusion layers | profile Hive-Bar metadata plus `HIVE_GLOBAL_WALL_EXCLUSIONS` | normalized union enforced during display classification and preflight; server default empty |
| Cursor history | transfer-filtered account-history reads | bounded opaque cursor round-trip and malformed-cursor rejection; no fixed 1,000-operation rescan |
| Encrypted inbox | `public/js/m4-actions.js`, Keychain adapter, owner inbox | encryption before Fetch; server accepts ciphertext only; marked local decrypt; plaintext never posted back or persisted |
| Exact controlled transfers | M4 preflight state machine | current fee revalidation; Active authority; exact recipient/amount/memo; cancellation and duplicate behavior inherited from tested store |
| Transaction preservation | account-history transaction read and preflight store | transaction-id capture, exact operation match, block-number recording, accepted-versus-observed distinction |
| UI safety and disclosures | profile views and browser controller | plain-text rendering; owner authorization; public/permanent transfer facts; local-decryption disclosure; exact-operation dialog |

## Deterministic gate

- `git diff --check`: passed.
- Full `npm run check`: passed.
- Secret scan: passed across 127 repository files.
- ESLint: passed with zero warnings.
- Production Tailwind CSS build: passed.
- Current local candidate: 114 tests passed, 0 failed at local commit `984c07bc5d25ebbad2afd6f11d3e717bd249eed5` and tree `19ac369c1d45880c3b084e08850ac21f84536520`.
- Current remote candidate: GitHub Actions run `31565527272` passed the Node 24 deterministic gate on trigger-only child `be0f994f8586fb11689a6b3666849d706a7645e3`, whose parent is published candidate `6e872c5e23d51d761a748b60125b87c154f95e2f` and whose only additional change is the temporary validation-branch workflow trigger.
- Remote current-candidate results: 114 tests passed, 0 failed; secret scan passed across 127 files; ESLint, production CSS build, and production audit passed; 0 vulnerabilities.
- The push-triggered live Hive read-only smoke job was skipped by design. The single-use `codex/m4-ci-validation` branch was deleted after the run and independently verified absent.
- Automated tests before the controlled profile trial: 109 passed, 0 failed.
- Profile metadata malformed/no-erase and stale-conflict corpus: passed.
- Canonical asset and exact operation vectors for all four M4 actions: passed.
- Wall fee, marker, direction, asset, sender-exclusion, and unrelated-transfer corpus: passed.
- Public wall HTML and JSON API classification: passed.
- Owner-only inbox/settings authorization and no-store behavior: passed.
- Browser inbox privacy journey: plaintext encrypted before server preflight; local decrypted text never posted back.
- Structural HTML, axe serious/critical, 360 CSS-pixel responsive, contrast, XSS, and unsafe-URL gates: passed.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: lockfile consistency passed.
- Production dependency audit: 0 vulnerabilities.

## Controlled profile trial

One M4 profile operation was individually authorized and completed. The authorization is consumed and does not authorize a retry or any reward, wall, inbox, payment, or other Hive operation.

| Evidence field | Recorded result |
| --- | --- |
| Authorization | Product-owner instruction recorded 2026-08-12 UTC: `I authorize this exact @fartman69 profile update, with expected fingerprint 9348fd33b25bf21d61454566a023e8cffa9ef8efcc2e55cbb18c640925551e01. No other Hive operation or retry is authorized.` |
| Candidate | Published commit `834ad81f3ed05fc6e5b8cd72c5d53a99bc430f68`; tree `1a91f0eec191c03d8ad032acf0886cf59fa0cc77`; 109-test deterministic gate and remote CI run `31554630023` passed before execution |
| Pre-state | `@fartman69` existed; `posting_json_metadata` and legacy `json_metadata` were empty; two nodes agreed through irreversible blocks `108946940` and `108946941` at 2026-08-12 02:18:42 UTC |
| Account/action/authority | `fartman69`; `account_update2`; Posting |
| Exact change | Public display name from empty to `fartman69`; explicit Hive-Bar metadata version `1`, wall fee `1.000 HBD`, and empty profile-managed wall blocklist; about text and profile image remained empty |
| Fingerprint | `9348fd33b25bf21d61454566a023e8cffa9ef8efcc2e55cbb18c640925551e01` |
| Transaction | `eeb0ecc1174e1763956446384ab0c6db688da7dd`; block `108947213`; transaction index `0`; timestamp 2026-08-12 02:32:21 UTC |
| Exact-operation observation | Three independent RPC nodes returned one `account_update2` operation with the authorized account, empty legacy field, exact posting metadata, and no additional operation |
| Post-state | All three nodes returned `posting_json_metadata` as `{"profile":{"name":"fartman69"},"hivebar":{"version":1,"wall_fee":"1.000 HBD","wall_blocklist":[]}}`; `last_account_update` was 2026-08-12 02:32:18 UTC |
| Finality | Transaction block `108947213` was below last irreversible block `108947289` or `108947290` on all three nodes at 2026-08-12 02:36:12 UTC |
| Key custody | Hive-Bar received no password, private key, WIF, seed phrase, Keychain export, or signing authority; the user confirmed through local Hive Keychain |
| Cleanup | Operator confirmed on 2026-08-12 UTC that the local process was stopped and the process-scoped controlled environment was cleared |

## Observation incident and stabilization

Immediately after Keychain acceptance, Hive-Bar displayed `Keychain accepted the broadcast, but confirmation is incomplete. Do not retry automatically. Hive data is temporarily unavailable.` The transaction was nevertheless exact, successful, and later irreversible. Diagnosis reproduced the three configured nodes' normal pre-indexing response: JSON-RPC code `-32003` with `Unknown Transaction` followed by the exact requested ID. The original RPC pool classified that expected pending response as node failure and the browser exited its observation loop on the resulting `503`.

The stabilization change accepts only code `-32003` whose message contains the exact requested transaction ID as a temporary null lookup. It remains `broadcast_accepted`, preserves browser polling, does not fail over or penalize the responding node, and does not relax the final transaction-ID or exact-operation comparison. A different ID, error code, message, transport failure, malformed response, or operation mismatch still fails closed. Regression coverage includes both pool health and M4 pending-observation behavior. The stabilized candidate therefore required a new full gate and publication identity before another controlled trial.

The post-incident stabilization gate passed: `git diff --check`; secret scan across 127 repository files; ESLint with zero warnings; production CSS build; 111 tests with zero failures; production audit with zero vulnerabilities; and lockfile dry-run consistency. A live negative transaction lookup returned pending without failover, left all three configured nodes available, and recorded zero node failures. The local stabilization and cleanup commits were `64706cdf108cd01b87d5ba0d2fba9f6b2762f9df` and `460acc3ea60f55870674afad0385ddb62f72d545`. Their published equivalents were `41eaab21fa46fa4673382147a2e3cf36bcd28788` and `cf30f62bbdbf8d3126f77e8bd3a945f57077b11c`, preserving exact final tree `2c01f0eb2f8a10f388eb4e4007b16569ebaf3abd`. Remote deterministic run `31559511496` passed on trigger-only child `ca2dd094df01cad9712f2652405779356b76348b`; its temporary validation branch was deleted and verified absent.

## GRF-06 remediation and current publication

A read-only acceptance audit against approved specification 0.1.4 found that the initial followers/following implementation returned only one capped page and exposed no continuation cursor. This did not satisfy GRF-06 for accounts with more connections than the page limit.

The remediation adds a validated opaque account cursor, bounded look-ahead, inclusive-anchor removal, de-duplication, batched profile retrieval, safe username/avatar fallback when a Bridge profile is missing, and continuation links for full-page, HTMX, and legacy fragment routes. Invalid cursors fail with a safe client error before any RPC request. Deterministic coverage traverses first and second pages, proves that the anchor is not duplicated, exercises the `following` response field independently, verifies safe missing-profile behavior, and rejects malformed cursors.

| Evidence field | Recorded result |
| --- | --- |
| Local commit | `984c07bc5d25ebbad2afd6f11d3e717bd249eed5`; parent `460acc3ea60f55870674afad0385ddb62f72d545` |
| Published commit | `6e872c5e23d51d761a748b60125b87c154f95e2f`; parent `cf30f62bbdbf8d3126f77e8bd3a945f57077b11c` |
| Exact shared code tree | `19ac369c1d45880c3b084e08850ac21f84536520` |
| Patch SHA-256 | `bbf1caed4695805f02f1ec2e51e71451d77addcdd6439f8a5e80dcb560ca82a7` |
| Local deterministic gate | Full `npm run check` passed; 114 tests passed, 0 failed; secret scan 127 files; zero production vulnerabilities |
| Remote validation | GitHub Actions run `31565527272`; push event; trigger commit `be0f994f8586fb11689a6b3666849d706a7645e3`; trigger tree `9f371a35614397c8711e15d1f8d74bc5f2db1e28`; Node 24 verification succeeded |
| Live-read boundary | `Live Hive read-only smoke` job skipped because the validation used a push event; no Hive operation was executed |
| Cleanup | `codex/m4-ci-validation` deleted through authenticated GitHub CLI and independently verified absent |
| Branch/PR boundary | The publication chain through the wall-trial candidate is code candidate `6e872c5e23d51d761a748b60125b87c154f95e2f`, documentation child `ef238f46010e55a34195cf30d235e85e267e6893`, and reward-evidence child `b23036e00a1eb84c5cfb0f0b35f474114c076d79`; PR #1 remains open and draft at M2 head `9085e9d00d73f61e0ea0b450832f28ac782ef36d` |

## Controlled reward-claim trial

One M4 reward claim was individually authorized and completed. The final authorization superseded a stale earlier fingerprint, is now consumed, and does not authorize a retry or any profile, wall, inbox, payment, or other Hive operation.

| Evidence field | Recorded result |
| --- | --- |
| Authorization | Product-owner instruction recorded 2026-08-12 UTC: `I authorize exactly one @etblink claim-rewards operation using 0.000 HIVE, 0.000 HBD, and 5692.710433 VESTS under Posting authority, with expected fingerprint 4a11acacb0517b95c74cec9e1f744c513ee818d4272dba461a2d4cac20cc3a7d. This supersedes the stale authorization for fingerprint ed9adaa93b99c60fec29e2826845f62ad3338872167e95686b75d9474fa004d5. No other Hive operation or retry is authorized.` |
| Candidate | Local commit `75cd0d4734c967d5147cf49ea248137cba1b9af5`; published equivalent `ef238f46010e55a34195cf30d235e85e267e6893`; exact shared tree `c3647da5261a1a8a60b3bf7048eeb4c6cb65502f`; full 114-test gate passed on the exact tree before execution |
| Stale-review guard | The first authorized fingerprint `ed9adaa93b99c60fec29e2826845f62ad3338872167e95686b75d9474fa004d5` expected `5410.015284 VESTS`. Hive-Bar's mandatory current-state re-fetch instead produced `5435.861707 VESTS`; the operator stopped before Keychain, no transaction was broadcast, and that authorization was not reused. Three nodes later agreed on the final authorized value below. |
| Pre-state | Three independent RPC nodes agreed immediately before execution on `0.000 HIVE`, `0.000 HBD`, and `5692.710433 VESTS` claimable; liquid balance was `4.335 HBD`; vesting shares before settlement were `187694435.787716 VESTS` |
| Account/action/authority | `etblink`; `claim_reward_balance`; Posting |
| Exact operation | One operation with `account: etblink`, `reward_hive: 0.000 HIVE`, `reward_hbd: 0.000 HBD`, and `reward_vests: 5692.710433 VESTS`; no additional operation |
| Fingerprint | `4a11acacb0517b95c74cec9e1f744c513ee818d4272dba461a2d4cac20cc3a7d` |
| Transaction | `4ccac0397bf341f8790ae6ceb0122a2749761f36`; block `108951195`; transaction index `17`; timestamp 2026-08-12 05:51:57 UTC |
| Exact-operation observation | All three configured RPC nodes returned the same transaction ID, block, and single authorized `claim_reward_balance`; AppBase NAI values decoded exactly to the authorized canonical assets |
| State transition | Vesting shares increased from `187694435.787716 VESTS` to `187700128.498149 VESTS`, an exact `5692.710433 VESTS` increase. A separate `686.545188 VESTS` curation reward accrued eight blocks later in virtual operation block `108951203`; the resulting non-zero reward balance is new post-claim accrual, not an incomplete claim. |
| Finality | Transaction block `108951195` was below last irreversible block `108951213` or `108951214` on all three nodes at 2026-08-12 05:52:51–05:52:54 UTC |
| Browser outcome | Hive-Bar observed success and reloaded the wallet. The operator reported that no error or other message was displayed. |
| Key custody | Hive-Bar received no password, private key, WIF, seed phrase, Keychain export, or signing authority; the user confirmed the exact Posting operation through local Hive Keychain |
| Cleanup | Operator confirmed on 2026-08-12 UTC that the local process was stopped and the process-scoped controlled environment was cleared |

## Controlled public-wall trial

One M4 public-wall transfer was individually authorized and completed. The authorization is consumed and does not authorize a retry or any profile, reward, inbox, payment, or other Hive operation.

| Evidence field | Recorded result |
| --- | --- |
| Authorization | Product-owner instruction recorded 2026-08-12 UTC: `I authorize exactly one @etblink public wall transfer to @fartman69 of 1.000 HBD under Active authority, with exact memo hivebar-wall:v1:Hive-Bar M4 controlled wall verification. and expected fingerprint 34cd8e318189b5e8444b53aff5b1e1509dedd418615acbc6779dbc2a427be692. I acknowledge that the message and transaction are public and permanent. No other Hive operation or retry is authorized.` |
| Candidate | Local commit `cffae68d2ac6d68ed200585dc437fd7f44d4deaf`; published equivalent `b23036e00a1eb84c5cfb0f0b35f474114c076d79`; exact shared tree `278631302caa313710e162cfa45caa1bc9d90bae`; full 114-test gate passed on the exact tree before execution |
| Pre-state | Three independent RPC nodes agreed that `@etblink` held `4.335 HBD`, `@fartman69` held `0.000 HBD`, and the recipient's posting metadata set wall fee `1.000 HBD` with an empty profile-managed blocklist. The controlled environment's global exclusion list was explicitly empty, no qualifying prior transfer was found, and last irreversible block was `108951468` at 2026-08-12 06:05:39 UTC. |
| Account/action/authority | `etblink` to `fartman69`; `transfer`; Active |
| Exact operation | One operation with `from: etblink`, `to: fartman69`, `amount: 1.000 HBD`, and memo `hivebar-wall:v1:Hive-Bar M4 controlled wall verification.`; no additional operation |
| Fingerprint | `34cd8e318189b5e8444b53aff5b1e1509dedd418615acbc6779dbc2a427be692` |
| Transaction | `67148f3ce401e8d0d472b2acf2473e9dcc90f1cc`; block `108951652`; transaction index `9`; timestamp 2026-08-12 06:14:51 UTC; account-history index `10` |
| Exact-operation observation | All three configured RPC nodes returned exactly one transfer with the authorized sender, recipient, amount, memo, and no additional operation |
| State transition | All three nodes returned `@etblink` at `3.335 HBD` and `@fartman69` at `1.000 HBD`, exact respective changes of minus and plus `1.000 HBD` |
| Public classification | The wall page reloaded and displayed the exact authorized message as a qualifying public-wall entry |
| Finality | Transaction block `108951652` was below last irreversible block `108951693` or `108951694` on all three nodes at 2026-08-12 06:16:54–06:16:57 UTC |
| Browser outcome | Hive-Bar observed success and reloaded the wall page. The operator reported that the exact message was visible and no error text appeared. |
| Key custody | Hive-Bar received no password, private key, WIF, seed phrase, Keychain export, or signing authority; the user confirmed the exact Active operation through local Hive Keychain |
| Cleanup | Operator confirmed on 2026-08-12 UTC that the local process was stopped and the process-scoped controlled environment was cleared |

## Remaining live-operation status

The following evidence remains intentionally pending:

| Operation | Required separate authorization/evidence |
| --- | --- |
| Profile update | Complete for the one authorized `@fartman69` trial above; no retry or additional profile update authorized |
| Claim rewards | Complete for the one authorized `@etblink` trial above; exact settlement and separately traced post-claim accrual recorded; no retry or additional reward claim authorized |
| Public wall | Complete for the one authorized `@etblink` to `@fartman69` trial above; exact public classification, settlement, and finality recorded; no retry or additional wall transfer authorized |
| Encrypted inbox | named sender/recipient, approved HBD amount and message, Memo then Active confirmations, recipient-only local decrypt, transaction/block |

Each trial must follow [M4_CONTROLLED_WRITE_RUNBOOK.md](M4_CONTROLLED_WRITE_RUNBOOK.md). Normal `HIVE_WRITE_MODE=disabled` and rejection of production write mode remain unchanged.
