# Hive-Bar M15.5.4 Real Hive Content Compatibility and Deterministic CSS Inputs

Status: **SOURCE-ONLY CANDIDATE — CI AND OWNER ACCEPTANCE REQUIRED**

## Binding

M15.5.4 is rooted at the exact accepted source head that followed M15.5.3:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `16243446a5f606e257722d178a74a6ae945a73ba`
- parent tree: `baa228de444d2621325b531fae1fa8cae7a393f9`
- candidate branch: `codex/m15-5-4-real-hive-content-compat`

The owner-supplied production smoke established three live facts before this source work began:

1. Hive Keychain mobile 2.13.1 on iOS can now sign in successfully;
2. raw HTML image markup in a real post and raw table/image/subscript markup in a real HiveBuzz comment are still displayed as source text rather than rendered content; and
3. the mathematical post still exposes bare TeX commands such as `\\mathcal`, `\\mathfrak`, `\\in`, and `\\circ` instead of rendering them.

The M15.5.3 iOS Keychain implementation is frozen. M15.5.4 does not modify authentication or Keychain code.

## Lane 1 — bounded raw Hive HTML

Hive content in the wild is not Markdown-only. Existing posts and comments can contain raw HTML such as `<img>`, `<table>`, `<br>`, `<sub>`, and `<a>`.

M15.5.4 enables Markdown raw-HTML parsing, but it does **not** trust raw HTML. Rendering is split into two fail-closed stages:

1. normal Hive content is passed through a narrow content sanitizer that admits only the existing text/heading/list/link/image/table elements plus `sub`, `sup`, and legacy `center`;
2. internally generated MathML is sanitized separately and inserted only after the untrusted-content sanitizer has removed raw MathML.

This separation prevents an author from smuggling raw `<math>` markup through the allow-list merely because Hive-Bar itself needs MathML for generated mathematics.

Raw content still cannot introduce scripts, iframes, objects, forms, style elements, event-handler attributes, arbitrary CSS classes, unsafe URL schemes, or executable markup. External HTTPS images continue to be normalized through `https://images.hive.blog/0x0/<original HTTPS URL>` rather than broadening the Content Security Policy.

## Lane 2 — observed bare TeX compatibility

M15.5.3 correctly handled explicit `$...$`, `$$...$$`, `\\(...\\)`, and `\\[...\\]` delimiters, but the owner smoke showed that real Hive mathematical posts also contain bare TeX commands in formula-shaped text.

M15.5.4 therefore adds a deliberately bounded compatibility layer:

- standalone formula-shaped lines containing recognized mathematical commands can render as display MathML;
- parenthesized formula-shaped fragments containing recognized commands can render as inline MathML;
- recognized atomic mathematical commands embedded in prose can render without requiring dollar delimiters;
- prose-like fragments are rejected by the bare-math heuristic rather than being promoted wholesale to mathematics;
- fenced code and inline code remain excluded;
- dangerous TeX commands remain inert;
- `\\mathfrak{...}` receives a local Unicode Fraktur compatibility normalization before the existing safe MathML renderer runs.

This is not unrestricted TeX execution and does not add a remote renderer, CDN, script, or font dependency.

## Lane 3 — deterministic Tailwind source corpus

Tailwind CSS v4 automatically scans from the CLI working directory unless source detection is otherwise constrained. Hive-Bar already explicitly registers `views` and `public/js` in `src/input.css`, but the CLI previously ran from the repository root, allowing unrelated tracked source, test, and documentation text to influence generated utility discovery.

M15.5.4 changes the CSS build and watch commands to run Tailwind with `--cwd ./views`. The input/output paths are adjusted relative to that working directory while the existing explicit `@source` declarations continue to include the intended UI source corpus.

A regression test writes class-like sentinel text under `docs/`, rebuilds the CSS, and requires byte-identical output. The sentinel is removed in a `finally` block and the stylesheet is rebuilt again, including on Windows CI.

## Regression requirements

The candidate must pass the complete existing deterministic quality gate on Ubuntu and Windows plus new coverage establishing that:

1. the observed PeakD raw `<img>` shape renders and is normalized through the Hive image origin;
2. the observed HiveBuzz table/image/subscript shape renders rather than appearing as literal markup;
3. links retain the existing safe target/rel policy;
4. scripts, iframes, event handlers, unsafe schemes, arbitrary utility classes, and untrusted raw MathML remain blocked;
5. the observed bare `\\mathcal`, `\\mathfrak`, `\\to`, `\\in`, and `\\circ` conventions produce safe mathematical output;
6. ordinary prose surrounding those formula fragments remains prose; and
7. backend/documentation class-like text cannot perturb the compiled stylesheet.

## Production boundary

M15.5.4 source qualification does not deploy anything. Production remains unchanged until a later explicit deployment authorization after exact candidate review and CI success.

No Cloudflare purge is required or authorized by this source milestone.

## Explicit non-actions

M15.5.4 does not authorize or perform:

- a Hive write, transfer, vote, comment, post, subscription, or broadcast;
- an Active-authority Keychain request;
- any change to the successful M15.5.3 iOS Keychain implementation;
- payment-window activation or M14.4 helper installation;
- a genuine or synthetic purchase;
- Distriator activation;
- changes to payment routes, payment JavaScript, payment storage, payment observation, or irreversible-confirmation semantics;
- social-authority changes;
- CSP broadening to arbitrary HTTPS image origins;
- a remote math renderer or runtime CDN;
- Cloudflare, DNS, Caddy, TLS, firewall, systemd, or environment changes;
- production deployment; or
- mutation of PR #1.
