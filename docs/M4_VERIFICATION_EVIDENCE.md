# M4 verification evidence

Status: deterministic candidate complete; live controlled-operation portion of the M4 exit gate pending separate authorizations

Baseline: Hive-Bar V1 acceptance specification 0.1.4

Evidence date: 2026-08-11

Branch: `codex/m4-profiles-settings-rewards-wall-inbox`

Accepted M3 tree: `e444514f2d951c2d8c65b602bb45ff341e18ff04`

Candidate commit/tree: recorded in the publication handoff after the immutable Git objects are created

## Deliverable evidence

| M4 deliverable | Implementation evidence | Deterministic evidence |
| --- | --- | --- |
| Safe metadata lifecycle | `src/hive/profile-settings.js` | absent/empty/malformed reads; owned-field merge; unrelated-field preservation; stale/malformed/no-op/size guards; independent validation |
| Exact profile update | `src/hive/m4-operations.js`, `/api/m4/preflight/profile` | exact Posting-authority `account_update2`, empty legacy JSON field, merged posting JSON, inspectable diff |
| Followers/following and owner routes | `routes/profile.js`, profile partials | public connection pages; verified-owner-only inbox/settings; owner-only reward control |
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
- Automated tests: 109 passed, 0 failed.
- Profile metadata malformed/no-erase and stale-conflict corpus: passed.
- Canonical asset and exact operation vectors for all four M4 actions: passed.
- Wall fee, marker, direction, asset, sender-exclusion, and unrelated-transfer corpus: passed.
- Public wall HTML and JSON API classification: passed.
- Owner-only inbox/settings authorization and no-store behavior: passed.
- Browser inbox privacy journey: plaintext encrypted before server preflight; local decrypted text never posted back.
- Structural HTML, axe serious/critical, 360 CSS-pixel responsive, contrast, XSS, and unsafe-URL gates: passed.
- `npm ci --ignore-scripts --dry-run --no-audit --no-fund`: lockfile consistency passed.
- Production dependency audit: 0 vulnerabilities.

## Live-operation status

No live M4 operation has been attempted or authorized. The M3 subscription pilot is not reusable authority for M4.

The following evidence remains intentionally pending:

| Operation | Required separate authorization/evidence |
| --- | --- |
| Profile update | named account, exact proposed fields, Posting confirmation, transaction/block, preserved post-state |
| Claim rewards | named account, exact current rewards, Posting confirmation, transaction/block, zeroed post-state |
| Public wall | named sender/recipient, approved HBD amount and text, Active confirmation, public classified entry, transaction/block |
| Encrypted inbox | named sender/recipient, approved HBD amount and message, Memo then Active confirmations, recipient-only local decrypt, transaction/block |

Each trial must follow [M4_CONTROLLED_WRITE_RUNBOOK.md](M4_CONTROLLED_WRITE_RUNBOOK.md). Normal `HIVE_WRITE_MODE=disabled` and rejection of production write mode remain unchanged.
