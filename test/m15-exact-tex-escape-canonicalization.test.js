'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderMarkdown } = require('../src/content/markdown');

const RAW_BODY_SHA256 = '8f73150d23ae7dd6d711894e89f0803d37516981c847d557bce5404019020224';

test('M15.5.5 binds the owner-captured raw Hive body identity used for exact TeX compatibility', () => {
  assert.equal(RAW_BODY_SHA256, '8f73150d23ae7dd6d711894e89f0803d37516981c847d557bce5404019020224');
});

test('M15.5.5 renders the exact double-escaped display TeX convention from the frozen Hive body', () => {
  const rendered = renderMarkdown([
    String.raw`A **finite relational system** is a triple \[ \\mathcal{S} = (\\Omega, \\mathcal{R}, \\mathcal{C}), \] where:`,
    '',
    String.raw`An **admissible extension** is a map \[ E : \\mathcal{S} \\to \\mathcal{S}' \] that:`,
    '',
    String.raw`An **admissible weighting** is a function \[ w : \\Sigma \\rightarrow \\mathbb{R}^+ \] satisfying:`,
    '',
    String.raw`Structural probability is the unique admissible weighting on (\\Sigma), given by \[ P(\\sigma) = \\frac{1}{|\\Sigma|}. \]`,
  ].join('\n'));

  assert.match(rendered, /class="hb-math hb-math--display"/);
  assert.match(rendered, /mathvariant="script"/);
  assert.match(rendered, /Ω/);
  assert.match(rendered, /→/);
  assert.match(rendered, /Σ/);
  assert.match(rendered, /mathvariant="double-struck"/);
  assert.match(rendered, /<mfrac>/);
  assert.match(rendered, /σ/);
  assert.doesNotMatch(rendered, /\\\\(?:mathcal|Omega|Sigma|sigma|frac|to|rightarrow|mathbb)/);
});

test('M15.5.5 canonicalizes escaped subscripts inside exact bare-parenthesis math fragments', () => {
  const rendered = renderMarkdown([
    String.raw`Let (\\mathfrak{E}) denote the **admissible extension class**.`,
    '',
    String.raw`**Closure under composition**: If (E\_1, E\_2 \\in \\mathfrak{E}), then (E\_2 \\circ E\_1 \\in \\mathfrak{E}).`,
    '',
    String.raw`Assume, for contradiction, that (w(\\sigma\_1) \\neq w(\\sigma\_2)) for two survivors (\\sigma\_1, \\sigma\_2 \\in \\Sigma).`,
  ].join('\n'));

  assert.match(rendered, /𝔈/);
  assert.match(rendered, /∈/);
  assert.match(rendered, /∘/);
  assert.match(rendered, /≠/);
  assert.match(rendered, /<msub>/);
  assert.doesNotMatch(rendered, /E\\_1|E\\_2|sigma\\_1|sigma\\_2/);
});

test('M15.5.5 keeps canonicalization scoped to recognized math and preserves code literals', () => {
  const rendered = renderMarkdown([
    String.raw`Unsupported prose \\notacommand remains ordinary text.`,
    '',
    '`\\\\mathcal{S} E\\_1`',
  ].join('\n'));

  assert.doesNotMatch(rendered, /hb-math/);
  assert.match(rendered, /<code>\\\\mathcal\{S\} E\\_1<\/code>/);
});
