# M15.5.7 nested bracket display-math compatibility

Status: source-only candidate. No production deployment, Hive write, Keychain request, payment activation, Cloudflare/DNS/Caddy/systemd/environment mutation, or PR #1 mutation is authorized by this change.

## Bound live evidence

The owner-observed affected post is:

- author: `etblink`
- permlink: `why-amplitudes-square-non-functoriality`
- raw UTF-8 body bytes: `13,936`
- raw body SHA-256: `3b51312616eedc66067e77f7d868a6dcdd41f8b04f9d1cd477a104cedea8c5bc`
- raw U+FFFD count: `0`

The read-only diagnostic reproduced the live defect with the accepted M15.5.6 renderer: display expressions containing Markdown-escaped ray notation such as `\[v\]` were split at the first interior `\]`. The replay produced two rendered summation glyphs but no rendered fraction and visibly stranded TeX around Axiom 6.3 and Theorem 7.1.

## Root cause

Hive-Bar recognizes `\[` ... `\]` as display-math delimiters. The affected Hive source also uses the same escaped square-bracket spelling inside those display expressions to represent literal ray notation such as `[v]` and `[v']`.

The prior extractor used first-match closing-delimiter search. Therefore an expression shaped like:

```text
\[ \\sum\_{\[v\]...} ... \]
```

was closed at the interior `\]` after `v` rather than at the outer display terminator. The remainder then re-entered ordinary Markdown scanning, where recognized commands could be rendered as isolated math atoms while neighboring TeX remained ordinary text.

This is an extraction-layer compatibility defect, not Unicode corruption and not missing `\\sum`/`\\frac` parser support.

## Correction

M15.5.7 makes only two compatibility changes:

1. `\[` display extraction now tracks nested `\[` / `\]` pairs and closes only when the outer pair is balanced.
2. After a candidate is already recognized as math, Markdown-escaped literal square brackets `\[` and `\]` are canonicalized to `[` and `]` before local MathML parsing.

Canonicalization remains scoped to recognized math. Literal code and ordinary prose keep the existing behavior.

## Regression contract

The deterministic regressions bind the affected raw-body SHA-256 and require:

- Axiom 6.3 to remain one display expression;
- both summations and their subscript structure to render;
- literal ray brackets to render as bracket operators inside MathML;
- Theorem 7.1 to contain a structural `<mfrac>` and the expected angle/rho symbols;
- no visible leaked TeX commands after generated MathML metadata is excluded;
- zero U+FFFD characters;
- adjacent independent display blocks to remain independent;
- all prior M15.5.5 and M15.5.6 regressions to remain unchanged.

## Frozen lanes

M15.5.6 native Fraktur MathML, M15.5.5 exact Hive escape canonicalization, image/raw-HTML handling, CSS/cache behavior, iOS Keychain/authentication, payment safety, write gating, deployment helpers, infrastructure, and PR #1 remain frozen.
