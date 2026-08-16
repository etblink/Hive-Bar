# Hive-Bar M15.5.5 Exact Hive TeX Escape Canonicalization

Status: **SOURCE-ONLY CANDIDATE — CI AND OWNER ACCEPTANCE REQUIRED**

## Binding

M15.5.5 is rooted at the exact accepted M15.5.4 source head:

- source branch: `codex/m6-read-only-release-readiness`
- parent commit: `5080d995e8c4ce55db9c88d665f03ab90287601c`
- parent tree: `c2b4e2cf87f7f00a4e0eb5ba9a4a0edb22878015`
- candidate branch: `codex/m15-5-5-exact-tex-escape-canonicalization`

The owner live M15.5.4 smoke established that:

1. post-body images render successfully;
2. HiveBuzz comment images/HTML render successfully;
3. Hive Keychain 2.13.1 on iOS still signs in successfully; and
4. the mathematical notation in `@etblink/non-collapse-and-the-forced` still does not render correctly.

Those three successful M15.5.4 lanes are frozen. M15.5.5 is math-only.

## Exact raw-body evidence

The owner captured the raw Hive body with the read-only `bridge.get_post` API and recorded:

- UTF-8 bytes: `11928`
- SHA-256: `8f73150d23ae7dd6d711894e89f0803d37516981c847d557bce5404019020224`

The captured body establishes the exact compatibility convention that M15.5.4 did not model:

- display delimiters are ordinary single-backslash TeX delimiters such as `\[ ... \]`;
- TeX commands inside those delimiters are stored double-escaped, for example `\\mathcal`, `\\Omega`, `\\Sigma`, `\\frac`, `\\in`, and `\\circ`;
- mathematical subscripts can carry Markdown escaping, for example `E\_1` and `\\sigma\_1`.

Representative owner-captured forms include:

```text
A finite relational system is a triple \[ \\mathcal{S} = (\\Omega, \\mathcal{R}, \\mathcal{C}), \]
An admissible extension is a map \[ E : \\mathcal{S} \\to \\mathcal{S}' \]
Let (\\mathfrak{E}) denote the admissible extension class.
If (E\_1, E\_2 \\in \\mathfrak{E}), then (E\_2 \\circ E\_1 \\in \\mathfrak{E}).
An admissible weighting is a function \[ w : \\Sigma \\rightarrow \\mathbb{R}^+ \]
\[ P(\\sigma) = \\frac{1}{|\\Sigma|}. \]
```

## Root cause

The M15.5.4 extractor correctly recognizes the outer `\[ ... \]` display delimiters, but the inner MathML parser expects supported TeX commands to begin with one backslash. A body token such as `\\mathcal` therefore reaches the parser with one extra escape character and is not interpreted as the intended command.

Likewise, `E\_1` reaches the parser with an escaped underscore instead of the parser's subscript operator `_`.

## Correction

M15.5.5 adds a narrow canonicalization step used only for recognized mathematical candidates:

1. double-escaped names that correspond to the local supported/safe TeX vocabulary are reduced from two backslashes to one before parsing;
2. `\_` is converted to `_` only when followed by a mathematical script atom;
3. the existing `\mathfrak{...}` compatibility normalization is applied after escape canonicalization;
4. bare-math recognition uses the same canonicalized view so the owner-observed doubled convention is recognized consistently;
5. bare command extraction accepts both existing single-backslash commands and the newly supported double-escaped form without changing source-index accounting.

Canonicalization is not a global rewrite of post text. Fenced code and inline code remain excluded, and unsupported double-escaped command names are left unchanged.

## Security and compatibility boundary

M15.5.5 does not broaden the HTML allow-list, CSP, image policy, or MathML trust boundary. Raw author-supplied MathML remains blocked. Dangerous TeX commands remain non-executable under the existing local MathML parser and sanitizer.

The existing M15.5.4 image/HTML correction is unchanged. The successful M15.5.3/M15.5.4 iOS Keychain implementation is unchanged.

## Regression requirements

The candidate must pass the complete existing deterministic quality gate on Ubuntu and Windows plus exact new fixtures establishing that:

1. the owner-captured double-escaped display forms render `mathcal`, `Omega`, `Sigma`, arrows, `mathbb`, sigma, and fractions as MathML;
2. owner-captured bare-parenthesis forms render `mathfrak`, membership, composition, inequality, and escaped subscripts correctly;
3. canonical single-backslash math continues to pass the existing M15.5.3/M15.5.4 tests;
4. unsupported doubled commands in ordinary prose are not promoted into mathematics;
5. inline code containing doubled TeX commands or escaped underscores remains literal code; and
6. all existing raw-HTML/XSS, payment, write-gating, Keychain, read-only release, accessibility, and deterministic CSS regressions remain green.

## Production boundary

M15.5.5 source qualification does not deploy anything. Production remains at accepted M15.5.4 until a later explicit deployment authorization after exact candidate review and CI success.

## Explicit non-actions

M15.5.5 does not authorize or perform:

- a Hive write, transfer, vote, comment, post, subscription, or broadcast;
- any Keychain signing request;
- any authentication or Keychain code change;
- payment-window activation or M14.4 helper installation;
- a genuine or synthetic purchase;
- Distriator activation;
- changes to payment routes, payment JavaScript, storage, observation, or irreversible-confirmation semantics;
- changes to the accepted image/HTML sanitizer or CSP policy;
- Cloudflare, DNS, Caddy, TLS, firewall, systemd, or environment changes;
- production deployment; or
- mutation of PR #1.
