'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderMarkdown } = require('../src/content/markdown');

const RAW_BODY_SHA256 = '3b51312616eedc66067e77f7d868a6dcdd41f8b04f9d1cd477a104cedea8c5bc';

function withoutMathMetadata(value) {
  return value
    .replace(/\saria-label="[^"]*"/g, '')
    .replace(/<annotation\b[^>]*>[\s\S]*?<\/annotation>/g, '');
}

function assertNoVisibleLeakedTex(value) {
  assert.doesNotMatch(
    withoutMathMetadata(value),
    /\\(?:sum|frac|dfrac|tfrac|mathcal|in|rho|ge|geq|langle|rangle)\b/,
  );
}

test('M15.5.7 binds the owner-diagnosed second Hive body identity', () => {
  assert.equal(
    RAW_BODY_SHA256,
    '3b51312616eedc66067e77f7d868a6dcdd41f8b04f9d1cd477a104cedea8c5bc',
  );
});

test('M15.5.7 keeps Markdown-escaped ray brackets inside the outer display expression', () => {
  const rendered = renderMarkdown(String.raw`For any two contexts (\\mathcal C) and (\\mathcal C') related by admissible extension or relabeling, \[ \\sum\_{\[v\]\\in\\mathcal C} P(\[v\]) = \\sum\_{\[v'\]\\in\\mathcal C'} P(\[v'\]). \]`);

  assert.equal((rendered.match(/hb-math--display/g) || []).length, 1);
  assert.equal((rendered.match(/>∑</g) || []).length, 2);
  assert.match(rendered, /<msub>/);
  assert.match(rendered, /<mo>\[<\/mo><mi>v<\/mi><mo>\]<\/mo>/);
  assert.match(rendered, /<mo>∈<\/mo>/);
  assert.doesNotMatch(rendered, /\uFFFD/);
  assertNoVisibleLeakedTex(rendered);
});

test('M15.5.7 preserves the full quadratic fraction around Markdown-escaped ray brackets', () => {
  const rendered = renderMarkdown(String.raw`Let (P) be a publicly coherent probability functional on rays in a finite-dimensional complex vector space of dimension at least three. Then (P) must factor through a positive quadratic form: \[ P(\[v\]) = \\frac{\\langle v, \\rho v\\rangle}{\\langle v, v\\rangle}, \] for some positive semidefinite operator (\\rho).`);

  assert.equal((rendered.match(/hb-math--display/g) || []).length, 1);
  assert.equal((rendered.match(/<mfrac>/g) || []).length, 1);
  assert.match(rendered, /<mo>⟨<\/mo>/);
  assert.match(rendered, /<mi>ρ<\/mi>/);
  assert.match(rendered, /<mo>\[<\/mo><mi>v<\/mi><mo>\]<\/mo>/);
  assert.doesNotMatch(rendered, /\uFFFD/);
  assertNoVisibleLeakedTex(rendered);
});

test('M15.5.7 keeps adjacent independent display blocks independent', () => {
  const rendered = renderMarkdown(String.raw`First \[ \\sum\_{\[v\]} P(\[v\]) \] then \[ \\frac{1}{2} \].`);

  assert.equal((rendered.match(/hb-math--display/g) || []).length, 2);
  assert.equal((rendered.match(/>∑</g) || []).length, 1);
  assert.equal((rendered.match(/<mfrac>/g) || []).length, 1);
  assertNoVisibleLeakedTex(rendered);
});
