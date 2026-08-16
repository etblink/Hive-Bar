# Hive-Bar M15.5.3 Content Rendering and iOS Keychain Compatibility

Status: **SOURCE-ONLY CANDIDATE — CI AND OWNER ACCEPTANCE REQUIRED**

## Binding

This correction is rooted directly at the accepted M15.5.2 source state:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `cb3bb44c420e88ad91395eb1f0ff39674e679ec5`
- parent tree: `161ce4f0e74330f9470bf088f443152a438c8c01`
- candidate branch: `codex/m15-5-3-content-ios-keychain-compat`

Production remains unchanged at the previously deployed M15.5.1 release until a later, separately authorized deployment.

## Reported compatibility defects

Public inspection exposed three bounded defects:

1. some Hive post images were present in sanitized Markdown but did not display;
2. TeX/LaTeX notation in public posts was shown as source text rather than rendered mathematics; and
3. Hive Keychain mobile 2.13.1 on iOS opened the Posting-signature prompt for Hive-Bar sign-in but did not return a completion before the application timeout, while the desktop browser extension completed normally.

## Image/CSP reconciliation

The Markdown renderer previously admitted arbitrary HTTPS image sources while the application Content Security Policy intentionally allowed only local images, data/blob URLs, and `https://images.hive.blog`. A valid external Hive-post image could therefore survive sanitization and then be blocked by the browser.

M15.5.3 does **not** broaden `img-src` to arbitrary HTTPS origins. Instead, sanitized external HTTPS post images are normalized through the already-approved Hive image service:

```text
https://images.hive.blog/0x0/<original HTTPS URL>
```

Existing `images.hive.blog` URLs are preserved without double-proxying. Post images remain lazy-loaded and are decoded asynchronously.

## Local mathematical rendering

M15.5.3 introduces a local server-side TeX-to-MathML compatibility renderer. No CDN, remote script, remote font, or runtime rendering service is added.

Recognized delimiters are:

- `$...$` for inline math;
- `$$...$$` for display math;
- `\(...\)` for inline math; and
- `\[...\]` for display math.

Inline and fenced code are excluded from math detection, and obvious ordinary currency such as `$5` is not promoted to mathematics.

The bounded renderer covers common scientific notation including Greek symbols, arithmetic and relation operators, arrows, sums/products/integrals, subscripts and superscripts, fractions, roots, named functions/operators, common math styles and accents, delimiters, and common matrix/alignment/cases structures.

Generated MathML is passed through the existing sanitizer with an explicit allow-list of MathML elements and attributes. Potentially active TeX features such as `\href`, `\url`, `\includegraphics`, and KaTeX-style HTML extension commands are rendered inert rather than becoming links or executable markup. Raw Markdown HTML remains disabled.

This is a compatibility renderer, not a claim of complete TeX implementation. Unsupported commands remain inert and visible rather than being interpreted unsafely.

## iOS Keychain diagnosis and correction

Review of the official Hive Keychain mobile 2.13.1 browser bridge established a mobile-specific compatibility boundary. The browser-facing `requestSignBuffer` bridge forwards the requested message to Keychain, while the hidden signing bridge constructs an injected single-quoted JavaScript call. That bridge escapes backslashes and apostrophes but does not escape literal newline characters in a string argument.

Hive-Bar's server challenge was multiline. The desktop browser extension accepts that form, but the iOS mobile path can therefore receive a message that cannot safely be embedded in that injected JavaScript string, leaving the signing operation pending until Hive-Bar's existing timeout rejects it.

M15.5.3 makes the challenge a single canonical line separated by ` | ` while preserving every authenticated field and security property:

- account;
- exact application origin;
- random nonce;
- issue time;
- expiry time; and
- explicit purpose stating that no Hive transaction is authorized.

Challenge TTL, single-use consumption, signature verification, current Posting-authority verification, session creation, cookie policy, and CSRF behavior are unchanged.

The Keychain adapter timeout is **not increased**. A timeout remains a failure. A late callback cannot convert an already rejected sign-in promise into success, and M15.5.3 adds regression coverage for that fail-closed behavior. No automatic retry is introduced.

## Regression requirements

The M15.5.3 candidate must pass the full existing deterministic quality gate on the supported Ubuntu and Windows CI matrix, plus new coverage establishing that:

1. external HTTPS Hive-post images are normalized to the allowed Hive image origin without broadening CSP;
2. already-normalized Hive image URLs are not double proxied;
3. representative inline and display TeX produces sanitized local MathML;
4. inline code, fenced code, ordinary currency, and hostile TeX commands remain safe;
5. the server-issued Keychain challenge contains no literal line separators;
6. the challenge retains account, origin, nonce, issue/expiry, and no-transaction purpose semantics; and
7. a timed-out `signBuffer` remains failed even if a success callback arrives later.

## Deployment boundary

Source acceptance does not deploy this candidate and does not modify the current Privex release, active environment, Cloudflare, Caddy, DNS, TLS, systemd, firewall, or any other production state.

If this candidate is later owner-accepted and separately authorized for deployment, production verification should revisit the two reported posts and perform a controlled iOS Keychain Posting-signature sign-in smoke test. That later smoke test must not perform a Hive transaction.

## Explicit non-actions

M15.5.3 does not authorize or perform:

- a Hive write, transfer, or broadcast;
- an Active-authority Keychain request;
- a payment-window activation;
- a genuine or synthetic purchase;
- Distriator activation;
- installation or activation of the M14.4 payment-window helpers;
- changes to payment routes, payment JavaScript, payment storage, observation, or confirmation semantics;
- changes to social-write authority;
- broadening of CSP to arbitrary HTTPS image sources;
- a third-party runtime CDN or remote math renderer;
- Cloudflare, DNS, Caddy, firewall, TLS, systemd, or environment changes;
- production deployment; or
- mutation of PR #1.
