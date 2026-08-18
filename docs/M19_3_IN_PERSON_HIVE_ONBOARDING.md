# M19.3 In-Person Hive Onboarding

Status: **source qualification candidate** rooted exactly at accepted, deployed M19.1 commit `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`, tree `1a4bb993ad59ca67032997d8938696a079a71e1f`.

## Purpose

M19.3 adds the account-creation experience that should be exercised by the first real 4th Street Bar beta users instead of handing them pre-existing Hive accounts. The intended patron path is:

1. choose an available Hive username on `fourthstreetbar.com`;
2. generate and save the account recovery credentials locally in the patron's browser;
3. create a short-lived one-time bartender QR containing only an opaque request URL;
4. pay the bartender a **$5.00 cash in-person onboarding/account-setup fee**;
5. have the bartender review the exact request while signed into the configured creator account;
6. approve one Active-authority Hive Keychain transaction containing one `create_claimed_account` operation and one `delegate_vesting_shares` operation;
7. observe the new account and exact starter delegation on Hive without automatic rebroadcast;
8. add the newly created account to the patron's own Hive Keychain and sign in to Hive-Bar.

## Economic and product boundary

The $5.00 cash charge is described as an in-person account setup/onboarding fee. Hive-Bar does **not** describe the customer as purchasing "$5 worth of Hive Power."

The starter delegation is a fixed complimentary participation subsidy expressed in Hive Power. The source default is `5.000 HP`; it is not automatically repriced against USD. The bar/creator remains owner of delegated Hive Power. No HIVE or HBD transfer is part of onboarding.

This product framing is not a legal conclusion. A narrow Nevada/US legal review remains required before broad public commercialization. M19.3 must not claim that the design is categorically exempt from money-transmission, virtual-currency, tax, consumer-protection, or other applicable rules.

## Customer key custody

Private credentials must remain wholly customer-controlled:

- a high-entropy master password is generated with browser cryptographic randomness;
- Hive owner, active, posting, and memo keys are derived in the customer's browser using the already pinned `hive-tx` dependency;
- the browser produces a downloadable recovery record for the customer;
- the customer must acknowledge saving the recovery record before a QR request can be created;
- the server receives only the four public keys;
- no master password, WIF/private key, or recovery record may be sent to Hive-Bar, placed in a QR, stored in server state, or written to browser `localStorage`/`sessionStorage`.

The customer recovery record is intentionally hidden from the page after the QR request is created. The customer is responsible for safeguarding the downloaded copy.

## Username and request qualification

Hive-Bar applies the current Hive new-account naming rules before any key generation/request submission: total length 3–16 lowercase characters; each dot-separated label at least three characters; each label starts with a letter and ends with a letter or digit; interior characters are lowercase letters, digits, or hyphens.

Availability is read from Hive when the customer checks the name and rechecked immediately before bartender preparation. Availability is provisional until the blockchain transaction is accepted.

Each request uses at least 32 random bytes of opaque entropy and expires after a bounded interval (15 minutes by default). The QR contains only the canonical HTTPS staff URL containing that opaque identifier. A request is single-use and single-instance state is appropriate to the currently accepted one-VPS production topology.

## Public-key validation

The server validates every submitted Hive public key before storing it. Validation includes the `STM` prefix, base58 decoding, compressed secp256k1 key length/prefix, and Hive RIPEMD-160 checksum. Unexpected fields in the submitted public-key object are refused.

## Bartender authorization and cash-first boundary

The staff page is not a server signer. It requires an existing Hive-Bar verified session for the **exact configured onboarding creator account**. No other signed-in account may prepare or start the Keychain transaction.

The bartender must explicitly confirm receipt of the $5.00 cash fee before Hive-Bar prepares the operations. Immediately before preparation Hive-Bar rechecks:

- onboarding is explicitly enabled and the persistent runtime is the accepted `beta` + `keychain` profile;
- the customer username remains unavailable to nobody else;
- the creator account exists;
- the creator has at least one `pending_claimed_accounts` token;
- dynamic vesting properties are available;
- the creator has sufficient non-delegated, non-powering-down VESTS for the fixed starter HP policy.

The default source configuration remains `HIVE_ONBOARDING_ENABLED=false`. Configuration alone is also insufficient outside `HIVE_WRITE_MODE=beta` plus `HIVE_SIGNER_MODE=keychain`, so the normal read-only deployment phase keeps onboarding inert.

## Exact Hive operation boundary

The prepared transaction contains exactly two operations, in order:

1. `create_claimed_account`
   - creator: configured creator account;
   - new account name: exact customer-selected name;
   - owner/active/posting authorities: threshold 1, no account authorities, one customer-supplied public key each;
   - memo key: customer-supplied public memo key;
   - empty JSON metadata/extensions.
2. `delegate_vesting_shares`
   - delegator: configured creator;
   - delegatee: exact new account;
   - vesting shares: integer-safe conversion from the fixed starter HP policy using current `total_vesting_fund_hive` and `total_vesting_shares`.

The operation envelope is SHA-256 fingerprinted and shown to staff before Keychain. The transaction requires `Active` authority and is sent to the existing browser Keychain adapter. The server stores no creator private key and exposes no server broadcast method.

## One-attempt / no-auto-retry rule

Immediately before opening Keychain, the server atomically advances the onboarding request from `prepared` to `signing`. A second `begin-broadcast` for the same request is refused.

If Keychain reports acceptance, Hive-Bar records the returned transaction id when available and begins read-only observation. If Keychain times out or the result is ambiguous, Hive-Bar marks/retains an observational state and **must not broadcast again**. Even an explicit Keychain cancellation consumes the one-attempt request from Hive-Bar's perspective; staff should create a fresh customer request rather than replay the locked operations.

Observation may be repeated because it is read-only. Completion requires both:

- the new Hive account exists with owner, active, posting, and memo public keys exactly matching the request; and
- the creator has an active vesting delegation to that account exactly matching the prepared starter VESTS amount.

A created account whose keys do not match is a conflict and stops the request.

## Recovery-account disclosure

The Hive account that executes `create_claimed_account` becomes the new account's initial recovery account under Hive's normal account-recovery rules. This does not expose the customer's private keys to the creator, but the relationship must be disclosed before signup. Future product work may provide clearer recovery guidance or a dedicated long-lived recovery policy.

## Creator-account policy

For long-term public operation, the preferred architecture is a dedicated bar-controlled onboarding creator/delegator account whose owner authority remains offline and whose active authority is limited operationally to the staff Keychain environment.

The project owner has stated that `@etblink` currently has a small inventory of pre-claimed account-creation tokens. M19.3 source qualification does not bind the production creator to `@etblink` and does not consume those tokens. A controlled live acceptance may separately authorize `@etblink` as the temporary creator for exactly one test account if desired.

## Source-only acceptance boundary

This M19.3 authorization **does not authorize consuming an account-creation token**. It **does not authorize a Hive Power delegation**, account creation, Keychain Active request, cash collection from a tester, protected production-environment edit, service restart, or source deployment.

After exact source qualification and integration, the next external step requires a **separate live acceptance authorization** naming at minimum:

- the creator account;
- the exact new-account username or rule for selecting it;
- the exact starter HP policy;
- one claimed-account token maximum;
- one account creation maximum;
- one delegation maximum;
- whether the $5.00 cash exchange is a controlled test or public customer transaction.

No live acceptance may automatically expand to multiple accounts.

## M19.3 source acceptance criteria

- exact parent is deployed/accepted M19.1 `e01407f5f29e3d0a1d41fe33fca129399b4cd2d4`;
- onboarding defaults disabled and remains inert under read-only deployment mode;
- normal five-action beta self-signing manifest is unchanged;
- customer private credentials are browser-only and public keys only cross the network;
- customer must save/acknowledge recovery data before request creation;
- strict Hive new-account name and public-key checksum validation pass;
- username availability is checked initially and immediately before preparation;
- opaque requests expire and refuse replay;
- exact creator session and $5.00 cash confirmation are required before preparation;
- creator ACT inventory and available HP are checked read-only;
- starter HP converts to VESTS using integer-safe current-chain arithmetic;
- prepared operation names are exactly `create_claimed_account`, `delegate_vesting_shares` under Active authority;
- no HIVE/HBD transfer operation is prepared;
- Keychain begins at most once per request and no ambiguous result is rebroadcast;
- read-only observation verifies exact account keys plus exact delegation;
- living production documentation records M19.2 as deployed/accepted and M19.3 as current;
- legal review remains an explicit pre-public-rollout item;
- complete deterministic qualification passes on Ubuntu and Windows;
- existing M18.2/M18.3/M18.4 visual gates remain green;
- no production, Hive, Keychain, Cloudflare, DNS, Caddy, Pay/Distriator, V1, or infrastructure mutation occurs during source qualification.
