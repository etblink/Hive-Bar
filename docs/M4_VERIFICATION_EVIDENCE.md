# M4 verification evidence

Status: M4 implementation and controlled verification complete on the current published candidate; the profile, reward-claim, public-wall, and encrypted-inbox trials succeeded irreversibly, and recipient-side local decryption succeeded; ready for the final read-only acceptance audit

Baseline: Hive-Bar V1 acceptance specification 0.1.4; SHA-256 `a2b6b3203681c7e908f8aec988e429a912139c80767d0687ee5772e27bc951e4`

Evidence date: 2026-08-12

Branch: `codex/m4-profiles-settings-rewards-wall-inbox`

Accepted M3 tree: `e444514f2d951c2d8c65b602bb45ff341e18ff04`

Published profile-trial candidate commit: `834ad81f3ed05fc6e5b8cd72c5d53a99bc430f68`

Published profile-trial candidate tree: `1a91f0eec191c03d8ad032acf0886cf59fa0cc77`

Post-trial stabilized published commit: `cf30f62bbdbf8d3126f77e8bd3a945f57077b11c`

Post-trial stabilized tree: `2c01f0eb2f8a10f388eb4e4007b16569ebaf3abd`

Local GRF-06 remediation commit: `984c07bc5d25ebbad2afd6f11d3e717bd249eed5`

Published GRF-06 code-candidate commit: `6e872c5e23d51d761a748b60125b87c154f95e2f`

Local and published GRF-06 code-candidate tree: `19ac369c1d45880c3b084e08850ac21f84536520`

Local evidence and reward-trial candidate commit: `75cd0d4734c967d5147cf49ea248137cba1b9af5`

Published evidence and reward-trial candidate commit: `ef238f46010e55a34195cf30d235e85e267e6893`

Local and published reward-trial candidate tree: `c3647da5261a1a8a60b3bf7048eeb4c6cb65502f`

Local reward-evidence and wall-trial candidate commit: `cffae68d2ac6d68ed200585dc437fd7f44d4deaf`

Published reward-evidence and wall-trial candidate commit: `b23036e00a1eb84c5cfb0f0b35f474114c076d79`

Local and published wall-trial candidate tree: `278631302caa313710e162cfa45caa1bc9d90bae`

Local wall-evidence and inbox-preparation candidate commit: `19635286ad823fd058be5e95277d58d7b4432240`

Published wall-evidence and inbox-preparation candidate commit: `a65181117b2eb23ee741f5e1ef873f276b47e4ee`

Local and published inbox-preparation candidate tree: `4dfa51b162c813fdd7973a4bd6c584ae88cac1cb`

Current local memo-sentinel remediation commit: `9b0341589a0089a21e46356783be23f37609b3e5`

Current published memo-sentinel remediation commit: `bd28ab9a116bcc63d4a8fb804c964242dcc0bdc5`

Current local and published memo-sentinel remediation tree: `6a9bda38e6f8c801b491101bd758c1387e957aa2`

Published inbox-incident evidence candidate commit: `ae171298bad13277a4517eeb03282556049e7a40`

Published inbox-incident evidence candidate tree: `ee744a15bf0670ba25501390f533f14aebdcd196`

Current local interactive-timeout remediation commit: `1d8a9d7b802a7d6727a3c14b8894d21f85822ea6`

Current published interactive-timeout remediation commit: `bd71ce0069acc626647d47d04d940277a09861f7`

Current local and published interactive-timeout remediation tree: `6a66bab73bf89e8f4cd0119fe273d188275d537a`

Interactive-timeout remediation patch SHA-256: `1799aaf227917fe89630fec341ff07f3c1806adedbb8f1d3ae4e9b7b2e192333`

Local validation-evidence and encrypted-inbox trial candidate commit: `95d64e4ede76486a08a08510e5b0e97f862e35d6`

Published validation-evidence and encrypted-inbox trial candidate commit: `6a18c45a893a7034381b7c5e32ef6231a11fde63`

Local and published encrypted-inbox trial candidate tree: `5d234b5fb49821716a93eb041890929a68ce462e`

Validation-evidence documentation patch SHA-256: `6e2c6d909fa845a8fb7d027b11f7f58aae9772fc3ca4ba0b875e4323e316d272`

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
| Encrypted inbox | `public/js/m4-actions.js`, Keychain adapter, owner inbox | encryption before Fetch; server accepts ciphertext only; marked local decrypt; plaintext never posted back or persisted; 15-second connection and 120-second human-interaction timeouts; delayed and late callback boundaries |
| Exact controlled transfers | M4 preflight state machine | current fee revalidation; Active authority; exact recipient/amount/memo; cancellation and duplicate behavior inherited from tested store |
| Transaction preservation | account-history transaction read and preflight store | transaction-id capture, exact operation match, block-number recording, accepted-versus-observed distinction |
| UI safety and disclosures | profile views and browser controller | plain-text rendering; owner authorization; public/permanent transfer facts; local-decryption disclosure; exact-operation dialog |

## Deterministic gate

- `git diff --check`: passed.
- Full `npm run check`: passed.
- Secret scan: passed across 127 repository files.
- ESLint: passed with zero warnings.
- Production Tailwind CSS build: passed.
- Memo-sentinel candidate: 115 tests passed, 0 failed at local commit `9b0341589a0089a21e46356783be23f37609b3e5` and tree `6a9bda38e6f8c801b491101bd758c1387e957aa2`; GitHub Actions run `31573106865` passed on its trigger-only child.
- Current interactive-timeout candidate: local commit `1d8a9d7b802a7d6727a3c14b8894d21f85822ea6`; published equivalent `bd71ce0069acc626647d47d04d940277a09861f7`; exact shared tree `6a66bab73bf89e8f4cd0119fe273d188275d537a`; patch SHA-256 `1799aaf227917fe89630fec341ff07f3c1806adedbb8f1d3ae4e9b7b2e192333`.
- Current local results: 119 tests passed, 0 failed; secret scan covered 127 repository files; ESLint and production CSS build passed; production audit found 0 vulnerabilities.
- Current remote validation: GitHub Actions run `31624355508` passed the Node 24 deterministic gate on trigger-only child `330c4451be6bcb01fb2b65a67823490c67265e69`, tree `ac1793e81c7164ed0c82559e148867894abac820`, whose parent is published candidate `bd71ce0069acc626647d47d04d940277a09861f7` and whose sole additional change enabled the temporary validation branch.
- Current remote results: 119 tests passed, 0 failed; secret scan passed across 127 files; ESLint, production CSS build, and production audit passed; 0 vulnerabilities.
- The push-triggered `Live Hive read-only smoke` job was skipped by design. The single-use `codex/m4-ci-validation` branch was deleted after the run and independently verified absent. The M4 candidate branch remained at `bd71ce0069acc626647d47d04d940277a09861f7`, and PR #1 remained open and draft at `9085e9d00d73f61e0ea0b450832f28ac782ef36d`.
- Encrypted-inbox trial candidate: local documentation commit `95d64e4ede76486a08a08510e5b0e97f862e35d6`; published equivalent `6a18c45a893a7034381b7c5e32ef6231a11fde63`; exact shared tree `5d234b5fb49821716a93eb041890929a68ce462e`; code is unchanged from the remotely validated interactive-timeout tree.
- Final evidence-closeout local result: full `npm run check` passed on the exact documentation update; 119 tests passed, 0 failed; secret scan covered 127 repository files; ESLint and the production CSS build passed; production audit found 0 vulnerabilities.
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
| Branch/PR boundary | The publication chain after the GRF-06 candidate includes documentation child `ef238f46010e55a34195cf30d235e85e267e6893`, reward-evidence child `b23036e00a1eb84c5cfb0f0b35f474114c076d79`, wall-evidence child `a65181117b2eb23ee741f5e1ef873f276b47e4ee`, and memo-sentinel remediation child `bd28ab9a116bcc63d4a8fb804c964242dcc0bdc5`; PR #1 remains open and draft at M2 head `9085e9d00d73f61e0ea0b450832f28ac782ef36d` |

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

## Encrypted-inbox preparation incident and remediation

One preparation-only encrypted-inbox attempt was separately authorized. It failed before local Memo encryption completed and before Hive-Bar created an operation preflight. The authorization is consumed. No Active broadcast was authorized or attempted, no transaction exists, and no retry is authorized.

| Evidence field | Recorded result |
| --- | --- |
| Preparation authorization | Product-owner instruction recorded 2026-08-12 UTC: `I authorize preparing, but not broadcasting, exactly one encrypted-inbox preflight from @etblink to @fartman69 for 1.000 HBD, using a private one-time test message that I will enter only in my local Hive-Bar form. Local Hive Keychain Memo encryption is authorized. No Active broadcast, Hive operation, retry, or other action is authorized.` |
| Candidate | Local commit `19635286ad823fd058be5e95277d58d7b4432240`; published equivalent `a65181117b2eb23ee741f5e1ef873f276b47e4ee`; exact shared tree `4dfa51b162c813fdd7973a4bd6c584ae88cac1cb`; the operator's exact detached checkout passed the full 114-test deterministic gate before preparation |
| Read-only pre-state | Three independent RPC nodes agreed that `@etblink` held `3.335 HBD`, `@fartman69` held `1.000 HBD`, the recipient fee was `1.000 HBD`, the profile-managed blocklist was empty, and both accounts had stable public Memo keys. The controlled global exclusion list was explicitly empty. |
| Browser outcome | After the operator selected **Encrypt and review transfer**, Hive-Bar displayed `Hive Keychain could not complete the request.` No Keychain popup appeared. Keychain version was `3.15.7`, and the operator verified that the `@etblink` Memo key was present. |
| Preflight/broadcast boundary | No exact-operation review dialog appeared; no ciphertext preflight, operation JSON, or fingerprint was created; no Active-authority prompt appeared; and no broadcast was attempted or accepted. Plaintext and ciphertext were not copied into evidence. |
| Independent no-operation check | Three independent RPC nodes showed no encrypted-inbox transfer through last irreversible blocks `108952468` and `108952469` at 2026-08-12 06:55:54–06:55:57 UTC. The latest `@etblink` transfer remained the prior authorized wall transaction `67148f3ce401e8d0d472b2acf2473e9dcc90f1cc`. |
| Defect | The browser passed inner plaintext beginning `hivebar-inbox:v1:` to Keychain instead of the Hive encrypted-memo sentinel plus marker `#hivebar-inbox:v1:`. Keychain 3.15.7 delegates Memo encoding to `@hiveio/hive-js`; its own deterministic fixture preserves the required leading `#` through decode. |
| Remediation | The browser now supplies and verifies `#hivebar-inbox:v1:` around private content. The adapter rejects unmarked plaintext before contacting Keychain. The server still receives only returned ciphertext and continues to build the public outer marker `hivebar-inbox:v1:#…`. |
| Local remediation | Commit `9b0341589a0089a21e46356783be23f37609b3e5`; parent `19635286ad823fd058be5e95277d58d7b4432240`; tree `6a9bda38e6f8c801b491101bd758c1387e957aa2`; patch SHA-256 `f32878b5b74c4696274aa3f0a9f8db99584d6b8fea0d08b50013bd58606b2e56` |
| Published remediation | Commit `bd28ab9a116bcc63d4a8fb804c964242dcc0bdc5`; parent `a65181117b2eb23ee741f5e1ef873f276b47e4ee`; exact shared tree `6a9bda38e6f8c801b491101bd758c1387e957aa2` |
| Deterministic validation | Local full gate: 115 tests passed, 0 failed; secret scan 127 files; zero-warning ESLint; production CSS build; zero production vulnerabilities. GitHub Actions run `31573106865` passed the same Node 24 gate on trigger-only child `0ad925dd7222e624899d3b7fc4050bbd2e6fa932`, tree `ceba8262ead893512b4ec20bd7714ce10ca05d5e`, whose sole extra change enabled the temporary validation branch. |
| Live-read boundary | The remote run used a push event, so `Live Hive read-only smoke` was skipped. No Hive or Keychain operation occurred during implementation, publication, or CI. |
| Cleanup | The operator confirmed local controlled-environment cleanup. The single-use `codex/m4-ci-validation` branch was deleted and independently verified absent. PR #1 remained unchanged. |

## Encrypted-inbox interactive-timeout incident and remediation

A second preparation-only authorization was consumed on the published memo-sentinel-remediated candidate. The operator approved the one local Memo-encryption popup, but Hive-Bar's 15-second client timer expired while that human review was still in progress. No ciphertext preflight, exact-operation review, fingerprint, Active prompt, broadcast, or Hive transaction followed. No retry is authorized.

| Evidence field | Recorded result |
| --- | --- |
| Preparation authorization | Product-owner instruction recorded 2026-08-12 UTC: `I authorize preparing, but not broadcasting, exactly one encrypted-inbox preflight from @etblink to @fartman69 for 1.000 HBD on published candidate ae171298bad13277a4517eeb03282556049e7a40 (tree ee744a15bf0670ba25501390f533f14aebdcd196), using a private one-time test message that I will enter only in my local Hive-Bar form. Local Hive Keychain Memo encryption is authorized. No Active broadcast, Hive operation, retry, or other action is authorized.` |
| Candidate | Published commit `ae171298bad13277a4517eeb03282556049e7a40`; exact tree `ee744a15bf0670ba25501390f533f14aebdcd196`; the operator's fresh detached checkout passed the full 115-test deterministic gate and remained clean before startup |
| Browser outcome | The Keychain Memo-encryption popup appeared and the operator approved it once after approximately 30–45 seconds of review. Hive-Bar then displayed `Hive Keychain did not respond in time.` The **Review exact Hive operation** dialog never opened. |
| Preflight/broadcast boundary | `preparePayload` awaited Memo encryption before calling `/api/m4/preflight/inbox`. The 15-second rejection prevented that request, so no server preflight id, operation JSON, marked transfer memo, or fingerprint existed. The Active broadcast call is reachable only after a successful preflight and affirmative exact-operation review; neither occurred, and the operator confirmed that no Active/transfer popup appeared. |
| Privacy boundary | The private one-time text and any locally produced ciphertext were not copied into chat or evidence. A late Keychain callback cannot change the already rejected Promise or resume the stopped controller path. |
| Defect | `DEFAULT_TIMEOUT_MS = 15_000` governed both passive extension connection/handshake work and human-reviewed sign, encrypt, decrypt, and broadcast requests. The observed 30–45 second review necessarily exceeded that bound. |
| Remediation authorization | Product-owner instruction recorded 2026-08-12 UTC authorizes only local timeout remediation, deterministic tests, and this incident evidence on the published candidate. It prohibits commit, push, PR change, CI branch creation, Keychain requests, Hive operations, and preparation retry. |
| Local remediation | The adapter now keeps a 15-second default for extension discovery and handshake while allowing 120 seconds for user-reviewed sign, broadcast, Memo encryption, and Memo decryption responses. The legacy `timeoutMs` constructor override still applies to both boundaries for deterministic compatibility. Local commit `1d8a9d7b802a7d6727a3c14b8894d21f85822ea6`; exact tree `6a66bab73bf89e8f4cd0119fe273d188275d537a`; patch SHA-256 `1799aaf227917fe89630fec341ff07f3c1806adedbb8f1d3ae4e9b7b2e192333`. |
| Published remediation | Equivalent remote commit `bd71ce0069acc626647d47d04d940277a09861f7`; parent `ae171298bad13277a4517eeb03282556049e7a40`; exact shared tree `6a66bab73bf89e8f4cd0119fe273d188275d537a`. |
| Deterministic validation | Adapter tests bind both production defaults, accept a delayed Memo callback after the shorter connection window, and keep an expired request rejected after a late callback. The M4 browser-flow regression proves a Memo timeout performs only the session read and never reaches preflight, review, or Active broadcast. Targeted result: 11 passed, 0 failed. Full local gate: 119 passed, 0 failed; secret scan 127 files; zero-warning ESLint; production CSS build; zero production vulnerabilities. GitHub Actions run `31624355508` passed the same Node 24 gate on trigger-only child `330c4451be6bcb01fb2b65a67823490c67265e69`, tree `ac1793e81c7164ed0c82559e148867894abac820`; its sole additional change enabled the temporary validation branch. |
| Remote-validation boundary | The push-triggered `Live Hive read-only smoke` job was skipped. The M4 candidate branch and PR #1 remained unchanged throughout validation. No Keychain request, Hive operation, or preparation retry occurred. |
| Cleanup | The operator confirmed that the controlled process stopped, process-scoped configuration was cleared, the detached temporary checkout was removed, and no Active/transfer popup had appeared. After remote validation, `codex/m4-ci-validation` was deleted and independently verified absent. |

## Controlled encrypted-inbox trial

One M4 encrypted-inbox transfer was prepared, separately fingerprint-authorized, broadcast, observed exactly, and decrypted locally by the recipient. The preparation, Active broadcast, and recipient-decryption authorizations are consumed and do not authorize a retry or any further Keychain or Hive operation. This evidence intentionally does not reproduce the private plaintext or public ciphertext.

| Evidence field | Recorded result |
| --- | --- |
| Candidate | Local documentation commit `95d64e4ede76486a08a08510e5b0e97f862e35d6`; published equivalent `6a18c45a893a7034381b7c5e32ef6231a11fde63`; exact shared tree `5d234b5fb49821716a93eb041890929a68ce462e`; the operator's clean detached checkout passed the full 119-test deterministic gate before preparation |
| Preparation-only rehearsal | One separately authorized preparation on the same candidate produced fingerprint `255992f0c5ef29ca5c1f696f065aa6b1ef44551215d335f60beeca401679ddbe`. The account, Active authority, recipient, amount, fee, and marked ciphertext summary matched; the operator cancelled at the exact-operation dialog, confirmed `Cancelled before Keychain. Nothing was broadcast.`, confirmed that no separate Active Keychain popup appeared, and completed cleanup. |
| Final preparation authorization | Product-owner instruction recorded 2026-08-12 UTC authorized exactly one preparation from `@etblink` to `@fartman69` for `1.000 HBD` on published candidate `6a18c45a893a7034381b7c5e32ef6231a11fde63`, with one Posting sign-in and one Memo-encryption request, and required the exact-operation dialog and controlled process to remain open pending fingerprint-bound authorization. It explicitly prohibited an Active request, broadcast, Hive operation, retry, or other Keychain request at that stage. |
| Pre-state and fee | The operator confirmed a visible `@etblink` balance of `3.335 HBD` and recipient fee of `1.000 HBD`; the preceding irreversible wall trial established `@fartman69` at `1.000 HBD`. Before creating the review, Hive-Bar used the authenticated session account, fetched and matched the recipient's current fee, enforced the sender-exclusion layers, and accepted only marked Keychain ciphertext. |
| Exact prepared operation | One `transfer` from `etblink` to `fartman69` for `1.000 HBD` under Active authority, with the public outer marker `hivebar-inbox:v1:` followed by Keychain ciphertext. The review reported 213 UTF-8 memo bytes. |
| Fingerprint | `76c4d1636a4d2789db7850987afec793fa9c9856bdcee96778d386b4d8f6c3f7` |
| Broadcast authorization | Product-owner instruction recorded 2026-08-12 UTC authorized exactly the already-prepared operation with that fingerprint on candidate `6a18c45a893a7034381b7c5e32ef6231a11fde63`, exactly one Active Keychain request and broadcast, and—only after exact transaction observation—one `@fartman69` Posting sign-in and one local Memo-decryption request. It acknowledged the permanent public transaction facts and prohibited every other Keychain request, Hive operation, and retry. |
| Transaction | `8fb2f478323b04fc78ae9cb52324b7f1bbb4a5ec`; block `108967921`; transaction index `10`; timestamp 2026-08-12 19:50:57 UTC |
| Exact-operation observation | `api.hive.blog`, `api.deathwing.me`, and `api.openhive.network` returned the same transaction ID, block, and single transfer with the authorized sender, recipient, amount, outer marker, and 213-byte marked ciphertext memo. Recomputing the operation fingerprint produced the authorized value; no additional operation was present. |
| State transition | All three nodes returned `@etblink` at `2.335 HBD` and `@fartman69` at `2.000 HBD`, exact respective changes of minus and plus `1.000 HBD` from the recorded pre-state. |
| Finality | Transaction block `108967921` was below last irreversible blocks `108968009` on `api.hive.blog`, `108967996` on `api.deathwing.me`, and `108967998` on `api.openhive.network`. |
| Browser outcome | Hive-Bar reloaded without error. The recipient inbox displayed the same transaction ID and block, with the authorized sender and amount. No error text appeared. |
| Recipient-side local decryption | After exact transaction observation, the operator used the separately authorized `@fartman69` Posting sign-in and one local Memo-decryption request. Decryption succeeded, and the operator privately confirmed that the plaintext matched exactly. Hive-Bar displayed `Decrypted locally. Plaintext was not sent to the server.` |
| Privacy boundary | Private plaintext was entered and displayed only in the local browser/Keychain path and was never posted to Hive-Bar's server. The encrypted memo and transaction facts are public and permanent; neither plaintext nor ciphertext is repeated in this evidence. |
| Key custody | Hive-Bar received no password, private key, WIF, seed phrase, Keychain export, Memo key, or signing authority. Posting authentication, Memo encryption/decryption, and Active broadcast remained in local Hive Keychain. |
| Cleanup | The operator confirmed that the controlled process stopped, process-scoped configuration was cleared, and the temporary detached checkout was removed. No authorization remains for retry or another Keychain or Hive operation. |

## Controlled live-operation status

All controlled live-operation evidence required by the M4 exit gate is complete. Every listed authorization is consumed; no retry or additional operation is authorized.

| Operation | Recorded completion |
| --- | --- |
| Profile update | Complete for the one authorized `@fartman69` trial above; no retry or additional profile update authorized |
| Claim rewards | Complete for the one authorized `@etblink` trial above; exact settlement and separately traced post-claim accrual recorded; no retry or additional reward claim authorized |
| Public wall | Complete for the one authorized `@etblink` to `@fartman69` trial above; exact public classification, settlement, and finality recorded; no retry or additional wall transfer authorized |
| Encrypted inbox | Complete for the one authorized `@etblink` to `@fartman69` trial above; preparation, exact fingerprint-bound Active broadcast, three-node exact observation and finality, state settlement, recipient-only local decryption, and privacy boundary are recorded. The two earlier consumed preparation incidents and both published remediations remain preserved above; no retry or additional encrypted-inbox transfer is authorized. |

Each trial must follow [M4_CONTROLLED_WRITE_RUNBOOK.md](M4_CONTROLLED_WRITE_RUNBOOK.md). Normal `HIVE_WRITE_MODE=disabled` and rejection of production write mode remain unchanged.
