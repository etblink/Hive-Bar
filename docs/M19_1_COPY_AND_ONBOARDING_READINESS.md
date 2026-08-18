# M19.1 — Copy and Onboarding Readiness

## Baseline

M19.1 starts only from accepted and integrated M18.4:

- commit `1aaef44c5b300810841f89044cf302aab789caf5`
- tree `ece4e565a514f01879761f2d5467dc7cc5323773`
- production remains accepted M17.3 under the beta self-signing runtime

## Objective

Prepare the already-qualified social application for a real closed beta by removing avoidable patron-facing ambiguity without adding another engineering milestone.

The governing voice remains the M16.5 copy contract: plain and welcoming, centered on 4th Street Bar and its community, Hive-aware without assuming blockchain expertise, explicit about public or irreversible consequences when they matter, and technical only when technical detail helps the patron make a safe decision.

## Authorized source scope

M19.1 may:

- clarify what Hive Keychain does during sign-in and make clear that the login signature is not a transaction;
- make the already accepted beta participation options easier to discover;
- clarify that private Inbox ciphertext is stored on Hive while Memo-key decryption occurs locally through Keychain;
- disclose that profile/message settings saved through Hive-Bar are public Hive profile metadata;
- replace implementation-shaped patron error wording with ordinary language;
- synchronize living documentation from accepted M18.4 into the M19 closed-beta phase;
- add focused deterministic regressions for those copy/onboarding guarantees.

## Frozen boundaries

M19.1 must not:

- add or remove a Hive operation;
- change operation construction, preflight, signing, observation, retry, pagination, RPC, or Keychain semantics;
- change the accepted beta or V1 action manifests;
- activate V1, Pay, Distriator, reward claiming, operator posting, or delegated posting;
- deploy source or alter the Privex host, Cloudflare, Caddy, DNS, TLS, service environment, or rollback state;
- perform a Hive or Keychain write.

## Acceptance

M19.1 is acceptable when:

1. patron-facing changes remain copy/onboarding-only;
2. established safety disclosures remain present;
3. the living source/production boundary identifies accepted M18.4 source and still-M17.3 production;
4. the roadmap identifies M19.1 as current and controlled beta deployment as separately authorized;
5. deterministic Ubuntu and Windows qualification pass;
6. existing M18.2, M18.3, and M18.4 visual acceptance remains green.

Acceptance of M19.1 authorizes no deployment. M19.2 controlled beta deployment remains a separate decision.
