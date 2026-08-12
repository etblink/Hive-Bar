# M4 profiles, rewards, wall, and inbox

M4 extends the accepted M3 identity and preflight controls to profile settings, reward claims, paid public wall messages, and encrypted inbox messages. It also adds public followers/following pages and owner-only settings and inbox pages. This is a deterministic candidate: no live M4 Hive operation is authorized by this implementation or its tests.

## Exact operation boundary

| Action | Hive operation | Authority | Server-owned checks |
| --- | --- | --- | --- |
| Profile settings | `account_update2` | Posting | current metadata re-fetch, revision match, owned-field merge, independent validation, exact diff |
| Claim rewards | `claim_reward_balance` | Posting | exact current HIVE/HBD/VESTS reward balances and non-zero guard |
| Public wall message | HBD `transfer` | Active | current recipient fee, marked memo, amount threshold, recipient, and both exclusion lists |
| Encrypted inbox message | HBD `transfer` | Memo encryption, then Active broadcast | browser-produced ciphertext only, current fee, marked memo, amount threshold, recipient, and both exclusion lists |

The server constructs and stores one exact operation envelope with the account, required authority, human summary, and SHA-256 fingerprint. The browser shows the exact JSON before Keychain. Keychain acceptance is recorded as pending; completion requires the same operation to be observed in the supplied transaction through an allowlisted read-only RPC method. An exact `Unknown Transaction` response during the normal post-broadcast indexing interval remains pending and does not count as an RPC-node health failure; every other RPC application or transport error still fails closed.

## Safe profile settings

`posting_json_metadata` is treated as untrusted text. Reads tolerate missing, empty, malformed, or differently shaped metadata without crashing. A save performs a fresh account read and compares the SHA-256 revision with the revision rendered in the form.

Hive-Bar owns only these settings:

- `profile.name`
- `profile.about`
- `profile.profile_image`
- `hivebar.version`
- `hivebar.wall_fee`
- `hivebar.wall_blocklist`

The merge preserves fields such as location, website, cover image, unknown profile fields, unknown Hive-Bar fields, and top-level data from other clients. A stale revision, malformed non-empty source, no-op update, invalid individual field, or merged document over 8 KiB blocks the operation before Keychain. The preflight summary exposes only the exact owned-field diff.

Profile images must use HTTPS on `images.hive.blog`. The wall fee must be a positive canonical three-decimal HBD amount. The profile-managed exclusion list accepts at most 100 valid Hive accounts.

## Wallet and rewards

The accepted wallet calculations continue to derive HIVE, HBD, Hive Power, regenerated resource credits, regenerated voting power, and reward balances from current Hive values. Presentation remains separate from the exact numeric values.

The reward builder ignores client-supplied balance values. It re-reads the account and inserts the exact current `reward_hive_balance`, `reward_hbd_balance`, and `reward_vesting_balance`. A claim with all three balances at zero is rejected before Keychain.

## Public wall classification

New wall memos use `hivebar-wall:v1:`. A history item appears publicly only when all of these conditions hold:

- it is an inbound transfer to the profile;
- its asset is HBD;
- its amount is at least the current profile fee, falling back to `1.000 HBD`;
- its memo has the exact versioned wall marker and non-empty message text;
- its sender is absent from both the profile-managed and server-global exclusion lists.

Ordinary transfers, below-fee transfers, outbound transfers, malformed or unmarked memos, encrypted inbox memos, and excluded service accounts are omitted. Unmarked historical transfers are off by design. Wall text is rendered as untrusted plain text, while transaction id and block remain available as evidence.

History is fetched through `account_history_api.get_account_history` using the transfer operation filter and an opaque cursor containing the next history index. It does not repeatedly fetch a fixed 1,000-operation window.

## Encrypted inbox privacy boundary

The send flow gives plaintext only to the sender's browser and Hive Keychain. Before any M4 preflight request, Keychain encrypts `hivebar-inbox:v1:` plus the message for the recipient. Hive-Bar receives only the returned ciphertext and builds an outer `hivebar-inbox:v1:` marked transfer memo.

The owner-only inbox returns marked ciphertext. On demand, the browser passes that ciphertext to the recipient's local Keychain Memo-key flow, verifies the decrypted inner marker, and inserts the remaining text with `textContent`. Decrypted plaintext is not sent back to Hive-Bar, logged, cached, stored, or persisted. The page uses `Cache-Control: no-store`.

Encryption does not hide the sender, recipient, HBD amount, timestamp, transaction id, or the permanent existence of the transfer. The UI discloses those public-chain facts before signing.

## Configuration

| Variable | M4 behavior |
| --- | --- |
| `HIVE_WALL_DEFAULT_FEE` | canonical positive three-decimal HBD; default `1.000 HBD`; explicit in production |
| `HIVE_GLOBAL_WALL_EXCLUSIONS` | comma-separated valid Hive accounts; empty by default |
| `HIVE_MESSAGE_HISTORY_PAGE_SIZE` | 5–100 transfer-history entries; default 25 |
| `HIVE_WRITE_MODE` | `disabled` by default; `controlled` requires an account allowlist; `production` rejected |
| `HIVE_CONTROLLED_ACCOUNTS` | exact accounts permitted during one authorized controlled run |

The global exclusion list and each profile's `hivebar.wall_blocklist` are combined for both classification and message-transfer preflight. The global list remains empty until explicitly configured.

## Primary references

- [Hive Keychain extension request API](https://github.com/hive-keychain/hive-keychain-extension/blob/master/documentation/README.md)
- [Hive broadcast operation definitions](https://developers.hive.io/apidefinitions/broadcast-ops.html)
- [Hive account-history API definitions](https://developers.hive.io/apidefinitions/)
