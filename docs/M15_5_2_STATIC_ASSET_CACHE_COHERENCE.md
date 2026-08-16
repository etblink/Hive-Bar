# Hive-Bar M15.5.2 Static Asset Cache Coherence

Status: **SOURCE-ONLY CANDIDATE — CI AND OWNER ACCEPTANCE REQUIRED**

## Binding

This correction is rooted directly at the owner-accepted and production-deployed M15.5.1 source:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `e1d13ed14b08ff06f1de37cbd60202fdcc8f88ed`
- parent tree: `e2f52cbcbb6c627e4c552e7160ed69ee00affc3e`
- candidate branch: `codex/m15-5-2-static-asset-cache-coherence`

## Production incident

After M15.5.1 production deployment, the release identity, read-only safety gate, service health, listener binding, and active environment all passed. The public UI nevertheless rendered incorrectly.

Read-only diagnostics established a mixed-release asset condition:

- Privex generated and served `/css/style.css` as 43,020 bytes with SHA-256 `1c3cb04ee1bb2f0c4553db9f6654b10c689015a622c5393729b1764b815e5fc9`;
- the canonical public URL initially returned a stale 36,218-byte object with SHA-256 `2cfd8b6dd75248baecc75244fcb18815a4dbf4338ab2e726afb509b8768b8176`;
- that stale response reported `Cache-Control: public, max-age=86400`, `cf-cache-status: HIT`, age 18,205 seconds, and the prior release's modification time;
- a cache-busted request returned the correct 43,020-byte origin object with the exact Privex SHA-256 and `cf-cache-status: MISS`;
- a single-file purge of `https://fourthstreetbar.com/css/style.css` restored the canonical URL to the exact 43,020-byte origin object and normal M15 rendering.

The root cause was therefore not M15 HTML, the production build, Privex, Express file selection, or browser disk cache. It was the application advertising stable-path mutable assets as fresh for one day, allowing a shared edge cache to retain old CSS while new HTML was deployed.

## Corrected cache contract

M15.5.2 changes the application static-asset policy to:

```text
Cache-Control: private, no-cache, max-age=0, must-revalidate
```

for all currently stable-path local static assets served from:

- `public/` — including `/css/*`, `/js/*`, and local venue/brand images;
- `/htmx/*`;
- `/vendor/zxing/*`.

The contract intentionally permits a browser to retain a representation for conditional validation while forbidding it from treating that representation as fresh without revalidation. `private` prevents a normal shared cache from using the response as a reusable edge object. ETags remain enabled so unchanged assets can still validate efficiently with `If-None-Match` and receive `304 Not Modified`.

The former production-only `max-age=1d` policy is removed.

## Vendor-assets decision

The existing HTMX and ZXing URLs are stable logical paths, not content-addressed filenames. Their bytes can change when a dependency changes across releases even if the URL does not. They therefore are not truthfully immutable and must follow the same revalidation policy.

A future content-addressed or fingerprinted asset route may use long-lived `immutable` caching only when the URL itself changes whenever the bytes change. M15.5.2 does not introduce such a pipeline.

## Regression requirements

Automated validation must establish that a production-configured application:

1. serves representative CSS, local images, HTMX, and ZXing assets with the exact revalidation cache contract;
2. does not emit `max-age=86400` or `immutable` for those stable paths;
3. retains an ETag for each representative asset;
4. returns `304 Not Modified` for a matching `If-None-Match` request while preserving the revalidation cache contract; and
5. leaves health endpoints' existing `no-store` behavior unchanged.

The full existing lint, build, tests, secret scan, and dependency audit remain required. Existing M14 payment, M9–M12 social-control, M15 presentation, accessibility, responsive, and security semantics must continue to pass unchanged.

## Deployment boundary

Source acceptance does not itself modify Cloudflare, Privex, Caddy, systemd, DNS, TLS, the production environment, or any currently deployed release.

If M15.5.2 is later accepted for production deployment, the existing exact-release deployment helper should be used with the active environment unchanged and write mode remaining disabled. After deployment, public verification should confirm that `/css/style.css` returns the newly deployed bytes and the corrected cache header without requiring a manual cache purge.

## Explicit non-actions

M15.5.2 does not authorize or perform:

- a Hive write or broadcast;
- a Keychain transaction request;
- a payment-window activation;
- a genuine or synthetic purchase;
- Distriator activation;
- installation of the M14.4 payment-window helpers;
- changes to payment routes, payment JavaScript, payment storage, payment observation, or payment confirmation semantics;
- changes to social-write authority;
- DNS, Cloudflare rule, Caddy, firewall, or TLS changes;
- mutation of PR #1.
