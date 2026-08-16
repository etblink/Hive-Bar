# Hive-Bar M15.5.1 Signed-Out Pay Navigation Correction

Status: **SOURCE-ONLY CANDIDATE — CI AND OWNER ACCEPTANCE REQUIRED**

## Binding

This correction is rooted directly at the owner-accepted M15.5 source:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `0a1269ac2094d44fa7bbf7aecb075c64ba1ad4da`
- parent tree: `19307c6589be5c6e8fcec78469cbe0f347d047ef`
- candidate branch: `codex/m15-5-1-signed-out-pay-nav`

## Owner observation

After M15.5 acceptance, the owner identified a capability-honesty issue in the persistent navigation: the Pay destination remained an active `/pay` link while signed out, even though the Pay page correctly requires a verified Hive session before any payment workflow can become available.

## Corrected shell state model

### Signed out

- the five-position mobile/tablet shell remains stable;
- the Pay slot remains visible so the layout does not shift;
- Pay is rendered as a disabled, non-link control with `aria-disabled="true"`;
- Pay has no `href` and therefore cannot navigate accidentally;
- its title explains: `Sign in from You to access Pay`;
- the existing `You` sign-in disclosure remains the path to a verified Hive session.

### Verified signed in, payment disabled

- Pay becomes a normal `/pay` navigation link;
- the existing Pay page remains accessible;
- the page truthfully reports that the Pay Tab is safely disabled unless a separately authorized controlled payment window exists.

### Verified signed in, payment enabled

- Pay remains the same `/pay` navigation link;
- all existing M14/M15 exact-review, Active-authority, durable-receipt, no-retry, and two-node irreversible-confirmation semantics remain unchanged.

## Direct signed-out `/pay` route

This correction does **not** remove or redirect the public `/pay` route. A user who directly visits `/pay` while signed out still receives the existing informational page explaining that verified sign-in is required. No payment form or Keychain transaction request is exposed in that state.

## Exact source scope

The intended candidate changes only:

- `views/common/header.ejs`;
- `test/m15-shell-primitives.test.js`;
- `test/m15-cross-platform-acceptance.test.js`;
- this implementation record.

No route, payment JavaScript, payment service, receipt store, observer, release gate, social-write implementation, deployment file, production environment, or binary asset is changed.

## Regression expectations

Automated validation must establish all of the following:

1. Signed-out shell contains no `a.app-nav-link[href="/pay"]`.
2. Signed-out Pay uses the existing disabled visual primitive and carries `aria-disabled="true"`.
3. The signed-out shell still contains exactly the stable labels Home, Explore, Create, Community, Pay, You.
4. Verified signed-in shell exposes a normal `a.app-nav-link[href="/pay"]`.
5. Direct signed-out `/pay` remains HTTP 200 with `Verified sign-in required` and no payment form.
6. Signed-in write-disabled `/pay` remains available and truthfully disabled at the payment layer.
7. Controlled payment state retains the existing Active-authority and no-retry wording and behavior.
8. All existing accessibility, responsive, security, social-write, and M14 payment state-machine tests continue to pass unchanged in meaning.

## Non-actions

M15.5.1 does not authorize or perform:

- Privex deployment;
- DNS, Cloudflare, TLS, Caddy, firewall, systemd, or environment changes;
- Hive writes or broadcasts;
- Keychain transaction requests;
- payment-window activation;
- a genuine purchase;
- Distriator activation;
- PR #1 mutation.

Deployment remains a separate authorization boundary after source acceptance and cleanup.
