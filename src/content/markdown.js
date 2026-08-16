'use strict';

const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');
const { renderLatexMathML } = require('./mathml');

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

const allowedTags = [
  'p', 'br', 'strong', 'em', 's', 'blockquote', 'code', 'pre', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'hr', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'span', 'div',
  'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mtext', 'mspace',
  'msub', 'msup', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mover', 'munder', 'munderover',
  'mtable', 'mtr', 'mtd', 'mstyle',
];

function isEscaped(source, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function findClosingDelimiter(source, start, delimiter, allowNewline) {
  for (let index = start; index <= source.length - delimiter.length; index += 1) {
    if (!allowNewline && source[index] === '\n') return -1;
    if (source.startsWith(delimiter, index) && !isEscaped(source, index)) return index;
  }
  return -1;
}

function extractMath(source) {
  const replacements = [];
  let output = '';
  let index = 0;
  let lineStart = true;
  let fence = null;

  function addMath(content, displayMode) {
    const token = `\uE000HIVEBARMATH${replacements.length}TOKEN\uE001`;
    replacements.push({ token, html: renderLatexMathML(content, { displayMode }) });
    output += token;
  }

  while (index < source.length) {
    if (lineStart) {
      const fenceMatch = source.slice(index).match(/^(\s*)(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[2][0];
        const count = fenceMatch[2].length;
        if (!fence) fence = { marker, count };
        else if (fence.marker === marker && count >= fence.count) fence = null;
      }
    }

    if (fence) {
      const char = source[index];
      output += char;
      lineStart = char === '\n';
      index += 1;
      continue;
    }

    if (source[index] === '`') {
      let count = 1;
      while (source[index + count] === '`') count += 1;
      const delimiter = '`'.repeat(count);
      const close = source.indexOf(delimiter, index + count);
      if (close >= 0) {
        const chunk = source.slice(index, close + count);
        output += chunk;
        lineStart = chunk.endsWith('\n');
        index = close + count;
        continue;
      }
    }

    if (!isEscaped(source, index) && source.startsWith('$$', index)) {
      const close = findClosingDelimiter(source, index + 2, '$$', true);
      if (close >= 0 && source.slice(index + 2, close).trim()) {
        addMath(source.slice(index + 2, close), true);
        index = close + 2;
        lineStart = false;
        continue;
      }
    }
    if (!isEscaped(source, index) && source.startsWith('\\[', index)) {
      const close = findClosingDelimiter(source, index + 2, '\\]', true);
      if (close >= 0 && source.slice(index + 2, close).trim()) {
        addMath(source.slice(index + 2, close), true);
        index = close + 2;
        lineStart = false;
        continue;
      }
    }
    if (!isEscaped(source, index) && source.startsWith('\\(', index)) {
      const close = findClosingDelimiter(source, index + 2, '\\)', false);
      if (close >= 0 && source.slice(index + 2, close).trim()) {
        addMath(source.slice(index + 2, close), false);
        index = close + 2;
        lineStart = false;
        continue;
      }
    }
    if (source[index] === '$' && source[index + 1] !== '$' && !isEscaped(source, index)) {
      const close = findClosingDelimiter(source, index + 1, '$', false);
      const content = close >= 0 ? source.slice(index + 1, close) : '';
      if (close >= 0 && content.trim() && !/^\s*\d+(?:[.,]\d+)?\s*$/.test(content)) {
        addMath(content, false);
        index = close + 1;
        lineStart = false;
        continue;
      }
    }

    const char = source[index];
    output += char;
    lineStart = char === '\n';
    index += 1;
  }

  return { source: output, replacements };
}

function proxyHiveImageUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return value;
  if (/^https:\/\/images\.hive\.blog(?:\/|$)/i.test(value)) return value;
  return `https://images.hive.blog/0x0/${value}`;
}

function renderMarkdown(value) {
  const source = typeof value === 'string' ? value : '';
  const extracted = extractMath(source);
  let rendered = markdown.render(extracted.source);
  for (const replacement of extracted.replacements) {
    rendered = rendered.split(replacement.token).join(replacement.html);
  }

  return sanitizeHtml(rendered, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      th: ['align'],
      td: ['align'],
      span: ['class'],
      div: ['class'],
      math: ['xmlns', 'display', 'aria-label'],
      annotation: ['encoding'],
      mspace: ['width'],
      mo: ['stretchy', 'movablelimits', 'largeop', 'separator'],
      mstyle: ['mathvariant'],
      mtable: ['columnalign', 'rowspacing', 'columnspacing'],
      mtd: ['columnalign'],
    },
    allowedSchemes: ['https'],
    allowedSchemesByTag: {
      a: ['https'],
      img: ['https'],
    },
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        target: '_blank',
        rel: 'nofollow noopener noreferrer',
      }),
      img(tagName, attribs) {
        return {
          tagName,
          attribs: {
            ...attribs,
            src: proxyHiveImageUrl(attribs.src),
            loading: 'lazy',
            decoding: 'async',
          },
        };
      },
    },
    disallowedTagsMode: 'discard',
  });
}

function plainTextExcerpt(value, maxLength = 200) {
  const source = typeof value === 'string' ? value : '';
  const withoutMarkup = sanitizeHtml(markdown.renderInline(source), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, ' ')
    .trim();

  return withoutMarkup.length > maxLength
    ? `${withoutMarkup.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
    : withoutMarkup;
}

module.exports = {
  plainTextExcerpt,
  proxyHiveImageUrl,
  renderMarkdown,
};