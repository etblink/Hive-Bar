'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderMarkdown } = require('../src/content/markdown');
const { renderLatexMathML } = require('../src/content/mathml');

function assertUtf8Stable(value) {
  const roundTrip = Buffer.from(value, 'utf8').toString('utf8');
  assert.equal(roundTrip, value);
  assert.doesNotMatch(roundTrip, /\uFFFD/);
}

test('M15.5.6 renders mathfrak structurally with native MathML rather than supplementary Unicode', () => {
  const rendered = renderLatexMathML(String.raw`\mathfrak{E}`);

  assert.match(rendered, /<mstyle mathvariant="fraktur"><mrow><mi>E<\/mi><\/mrow><\/mstyle>/);
  assert.doesNotMatch(rendered, /𝔈/u);
  assert.doesNotMatch(rendered, /\uFFFD/);
  assertUtf8Stable(rendered);
});

test('M15.5.6 fixes the owner-observed double-escaped Hive mathfrak forms without changing neighboring symbols', () => {
  const rendered = renderMarkdown([
    String.raw`Let (\\mathfrak{E}) denote the **admissible extension class**.`,
    '',
    String.raw`**Extension invariance**: (w) is unchanged under all admissible extensions in (\\mathfrak{E}).`,
    '',
    String.raw`Because admissible extensions are closed under composition, there exists an admissible extension (E \\in \\mathfrak{E}).`,
  ].join('\n'));

  const frakturStyles = rendered.match(/mathvariant="fraktur"/g) || [];
  assert.equal(frakturStyles.length, 3);
  assert.match(rendered, /<mstyle mathvariant="fraktur"><mrow><mi>E<\/mi><\/mrow><\/mstyle>/);
  assert.match(rendered, /∈/);
  assert.doesNotMatch(rendered, /𝔈/u);
  assert.doesNotMatch(rendered, /\uFFFD/);
  assertUtf8Stable(rendered);
});

test('M15.5.6 preserves existing native MathML style commands alongside fraktur', () => {
  const rendered = renderMarkdown(String.raw`\[ \\mathcal{S}, \\mathfrak{E}, \\mathbb{R} \]`);

  assert.match(rendered, /mathvariant="script"/);
  assert.match(rendered, /mathvariant="fraktur"/);
  assert.match(rendered, /mathvariant="double-struck"/);
  assert.doesNotMatch(rendered, /\uFFFD/);
  assertUtf8Stable(rendered);
});
