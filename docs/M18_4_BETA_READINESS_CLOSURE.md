# M18.4 — Beta-Readiness Closure

Status: **source-qualification candidate** rooted exactly at accepted M18.3 canonical `main` commit `524732a18559858bf20d2976cb5b791d6eaa36c8` / tree `ea2c5742f65669f8e5842fc2b357da821e893325`.

This milestone does not authorize `main` integration, production deployment, V1 activation, Hive writes, Keychain requests, payment/Distriator activation, or infrastructure mutation.

## Purpose

Close the remaining bounded patron-facing issues before controlled beta deployment without reopening the accepted transaction architecture.

M18.4 addresses four areas:

1. Followers/Following successful empty states must render rather than fail because an optional template error variable is absent.
2. Patron-facing length counters and follow availability copy must use ordinary language while preserving the exact existing validation and release boundaries.
3. Living documentation must identify accepted M18.3 as canonical source while production remains accepted M17.3 beta.
4. Qualification must cover the repaired social-graph states and the remaining touched Community/Post/Profile/Wallet/Inbox/Settings surfaces under a fail-closed visual fixture.

## Functional closure

Followers and Following continue to use the existing read-only Hive relationship methods, pagination cursor rules, HTMX targets, and profile routes. M18.4 does not migrate RPC families or change relationship semantics. It only makes the existing optional error branch safe when no error value is supplied and freezes successful empty-list behavior with full-page and HTMX regressions.

The live smoke lane extends its existing disabled-write read-only probe to sample Followers and Following for one observed Hive account. No broadcast, signing, mutation, or unknown RPC method is permitted.

## Patron copy closure

Exact byte-count enforcement remains unchanged: browser validation still measures UTF-8 bytes with `TextEncoder`, preserves every `data-max-bytes` ceiling, and rejects text whose encoded length exceeds that ceiling. Ordinary visible counters no longer describe the ceiling as a “byte limit”; they present simple used/maximum feedback instead.

Profile follow copy distinguishes three states:

- the owner sees that it is their own profile;
- a signed-out visitor is told to sign in with Hive Keychain to follow;
- a signed-in user whose current release does not permit Follow sees that Following is unavailable in that release.

No Follow/Unfollow action is enabled by copy alone.

## Living-document closure

`README.md`, `docs/README.md`, and `docs/ROADMAP.md` must state all of the following simultaneously:

- accepted M18.3 is canonical on `main` at `524732a18559858bf20d2976cb5b791d6eaa36c8` / tree `ea2c5742f65669f8e5842fc2b357da821e893325`;
- production remains accepted M17.3 with the accepted beta self-signing runtime;
- M18.4 is the current source-qualification lane;
- integration, deployment, and V1 activation remain separately authorized operations.

Historical milestone evidence remains untouched.

## Targeted visual closure

A separate M18.4 Playwright harness captures these six patron surfaces at `360`, `390`, `768`, `1024`, `1440`, and `1600` CSS pixels:

- Followers empty;
- Following empty;
- authenticated Community/post composer;
- authenticated post/reply composer;
- authenticated Wallet;
- authenticated owner Inbox and Settings.

The fixture is local-only, uses an incapable Keychain stub, blocks non-GET/HEAD application requests, injects deterministic read models, forbids Hive RPC calls, and fails on unexpected external browser network requests.

Each capture must have no page-level horizontal overflow, no uncontained off-screen focusable control, and no mobile footer/navigation collision. The harness preserves screenshots and a manifest identifying exact commit/tree/browser/runtime evidence.

## Preserved safety and release boundaries

M18.4 does not change:

- beta action manifest: `post`, `comment`, `vote`, `wall`, `inbox`;
- frozen V1 self-signing manifest;
- deterministic operation builders;
- signer/session authority rules;
- review-before-Keychain behavior;
- client-side Inbox encryption boundary;
- no-automatic-rebroadcast policy;
- post-broadcast read-only confirmation/recheck behavior;
- Pay/Distriator disabled production state;
- controlled/operator/delegated posting lanes;
- package/app identity `0.1.0`;
- Node `24.19.0` / npm `11.17.0`;
- production source/runtime or infrastructure.

## Acceptance criteria

M18.4 is acceptable only if:

- the candidate descends exactly from accepted M18.3 `524732a18559858bf20d2976cb5b791d6eaa36c8`;
- Followers and Following render valid empty full-page and HTMX states with HTTP 200;
- existing non-empty relationship pagination behavior remains covered;
- UTF-8 byte enforcement is unchanged while ordinary counters no longer say “byte limit”;
- signed-out versus release-unavailable Follow copy is truthful;
- living documentation matches accepted M18.3 source and accepted M17.3 production truth;
- Ubuntu and Windows deterministic quality gates pass;
- accepted M18.2 and M18.3 visual regressions remain green;
- the M18.4 targeted visual matrix passes and is manually reviewed;
- the separately invoked live smoke confirms read-only social-graph access with writes disabled;
- no production, Hive, Keychain, Pay/Distriator, Cloudflare, DNS, Caddy, host, or other infrastructure mutation occurs during source qualification.
