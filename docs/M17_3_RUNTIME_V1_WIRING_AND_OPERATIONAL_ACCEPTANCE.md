# M17.3 Runtime V1 Wiring and Operational Acceptance

Status: **source-only candidate** rooted at accepted M17.2. This document does not authorize V1 production activation, Hive writes, Keychain requests, or infrastructure mutation.

## Purpose

M17.3 wires the already-frozen V1 self-signing profile into runtime behavior while preserving the deployment and authorization boundaries established through M16 and M17.2.

## Runtime modes

The Privex startup path must dispatch explicitly:

- `disabled` -> `privex-public-read-only`
- `beta` -> `privex-beta-self-signing`
- `production` -> `privex-v1-self-signing`
- `controlled` -> the existing bounded payment/operator/pilot gates

No mode may fall through into another authorization family.

## Production-mode loader boundary

Direct `loadConfig()` calls continue to refuse `HIVE_WRITE_MODE=production` unless the caller opts into the V1 loader boundary with `allowV1Production: true`.

The reviewed V1 release checker and `scripts/start-privex.js` are the intended production-mode callers. The startup script must pass `assertPrivexV1Release()` before starting a V1 process. Direct `node src/server.js` therefore remains fail-closed for production write mode.

## V1 self-signing dispatch

The canonical manifest remains eleven actions:

Posting authority:

- post
- thread
- comment
- vote
- follow
- unfollow
- subscribe
- unsubscribe
- profile

Active authority:

- wall
- inbox

The social route receives only the eight social actions. The M4 route receives only `profile`, `wall`, and `inbox`. `claim-rewards`, Pay, Distriator, controlled/operator posting, delegated posting, and all other wallet operations remain excluded.

For V1 self-signing, the verified session account is both operation author/voter/sender and Keychain signer. Client-supplied identity fields cannot replace the verified session identity. The API reports `broadcastMode: v1-self`.

## Beta preservation

The accepted beta manifest remains exactly `post`, `comment`, `vote`, `wall`, and `inbox`. Existing beta semantics, Keychain review, no-auto-retry behavior, and post-broadcast read-only observation remain unchanged.

## UI authorization

V1-capable UI controls consume the same canonical `canWriteAction()` decision used by runtime authorization. This enables thread, follow/unfollow, subscribe/unsubscribe, profile settings, Wall, and Inbox only when their current runtime profile permits them.

## Monitoring

`/healthz` remains a liveness/identity endpoint. The local timer verifies the service identity and production environment, then accepts only recognized runtime modes: `disabled`, `beta`, `production`, or `controlled`.

Release authorization is not delegated to the health timer. It remains fail-closed at service startup through the exact profile gate. `/readyz` continues to provide Hive-backed read readiness.

The exact-commit deployment helper remains read-only-gated. M17.3 does not generalize deployment into direct beta/V1 source switching.

## Operational acceptance design

After source qualification and source integration, a separately authorized M17.3 operational rehearsal may:

1. deploy the exact accepted source through the existing read-only deployment gate;
2. restore the exact accepted beta environment byte-for-byte;
3. verify production remains beta;
4. run the V1 release gate in a temporary non-persistent process environment;
5. perform bounded read-only/browser acceptance of V1-visible controls without invoking Keychain or broadcasting to Hive.

The rehearsal must not persist `HIVE_WRITE_MODE=production`, start a production-mode service, issue a Keychain request, or make a Hive write.

## M17.3a acceptance criteria

- exact parent is accepted M17.2;
- direct/unqualified production loading remains refused;
- explicitly V1-gated loading parses the real production configuration without beta substitution;
- Privex startup selects the V1 gate only for `production` mode;
- V1 social and M4 route subsets are exact and self-signing;
- verified session identity overrides client-supplied identity fields;
- beta semantics remain frozen;
- Pay/Distriator/controlled/delegated/reward-claim lanes remain excluded;
- liveness monitoring is profile-neutral but identity-strict;
- deployment remains read-only-gated;
- package/application identity remains `0.1.0`;
- living documentation identifies M17.3 as current and production as M16.8 beta;
- Ubuntu and Windows deterministic CI pass;
- no production, Hive, Keychain, Cloudflare/DNS/Caddy, `main`, or PR #1 mutation occurs during source qualification.
