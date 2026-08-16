'use strict';

const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');
const { renderLatexMathML } = require('./mathml');

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
  typographer: false,
});

const contentAllowedTags = [
  'p', 'br', 'strong', 'em', 's', 'blockquote', 'code', 'pre', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'hr', 'table', 'thead', 'tbody',
  'tr', 'th', 'td', 'span', 'div', 'sub', 'sup', 'center',
];

const mathAllowedTags = [
  'span', 'div', 'math', 'semantics', 'annotation', 'mrow', 'mi', 'mn', 'mo', 'mtext',
  'mspace', 'msub', 'msup', 'msubsup', 'mfrac', 'msqrt', 'mroot', 'mover', 'munder',
  'munderover', 'mtable', 'mtr', 'mtd', 'mstyle',
];

const BARE_MATH_COMMANDS = new Set([
  'mathcal', 'mathfrak', 'mathbb', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'theta', 'lambda', 'mu',
  'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
  'infty', 'partial', 'nabla', 'ell', 'hbar', 'pm', 'mp', 'times', 'cdot', 'div', 'circ',
  'cap', 'cup', 'setminus', 'land', 'lor', 'le', 'leq', 'ge', 'geq', 'neq', 'ne',
  'approx', 'sim', 'simeq', 'equiv', 'propto', 'in', 'notin', 'ni', 'subset', 'supset',
  'subseteq', 'supseteq', 'perp', 'parallel', 'to', 'rightarrow', 'leftarrow',
  'leftrightarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'mapsto', 'longrightarrow',
  'longleftarrow', 'longleftrightarrow', 'sum', 'prod', 'coprod', 'int', 'iint', 'iiint',
  'oint', 'forall', 'exists', 'neg', 'emptyset', 'varnothing', 'ldots', 'cdots', 'vdots',
  'ddots', 'langle', 'rangle', 'lfloor', 'rfloor', 'lceil', 'rceil',
]);

const BARE_STYLE_COMMANDS = new Set([
  'mathcal', 'mathfrak', 'mathbb', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt',
]);

const HIVE_DOUBLE_ESCAPED_COMMANDS = new Set([
  ...BARE_MATH_COMMANDS,
  'zeta', 'eta', 'vartheta', 'iota', 'kappa', 'omicron', 'varpi', 'varrho', 'varsigma',
  'upsilon', 'Upsilon', 'Re', 'Im', 'ast', 'star', 'bullet',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp',
  'lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf', 'det', 'dim', 'ker', 'gcd', 'Pr',
  'frac', 'dfrac', 'tfrac', 'sqrt', 'text', 'operatorname', 'overline', 'bar', 'underline',
  'hat', 'widehat', 'vec', 'dot', 'ddot', 'left', 'right', 'begin', 'end', 'limits',
  'displaystyle', 'textstyle', 'quad', 'qquad',
]);

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

function findClosingBracketDelimiter(source, start) {
  let depth = 1;
  for (let index = start; index <= source.length - 2; index += 1) {
    if (isEscaped(source, index)) continue;
    if (source.startsWith('\\[', index)) {
      depth += 1;
      index += 1;
      continue;
    }
    if (source.startsWith('\\]', index)) {
      depth -= 1;
      if (depth === 0) return index;
      index += 1;
    }
  }
  return -1;
}

function readBalancedGroupEnd(source, start) {
  if (source[start] !== '{') return -1;
  let depth = 1;
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index += 1;
      continue;
    }
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function canonicalizeHiveMathEscapes(value) {
  return String(value || '')
    .replace(/\\\\([A-Za-z]+)/g, (match, command) => (
      HIVE_DOUBLE_ESCAPED_COMMANDS.has(command) ? `\\${command}` : match
    ))
    .replace(/\\_(?=[A-Za-z0-9{])/g, '_')
    .replace(/\\([\[\]])/g, '$1');
}

function normalizeLatexCompatibility(value) {
  return canonicalizeHiveMathEscapes(value);
}

function hasBareMathCommand(value) {
  const matches = canonicalizeHiveMathEscapes(value).matchAll(/\\([A-Za-z]+)/g);
  for (const match of matches) {
    if (BARE_MATH_COMMANDS.has(match[1])) return true;
  }
  return false;
}

function looksLikeBareMathFragment(value) {
  const source = canonicalizeHiveMathEscapes(value).trim();
  if (!source || source.length > 240 || !hasBareMathCommand(source)) return false;
  const scrubbed = source
    .replace(/\\[A-Za-z]+/g, ' ')
    .replace(/[{}_^0-9=+\-:;,.()[\]'|<>/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return !/[A-Za-z]{2,}/.test(scrubbed);
}

function matchBareMathAtom(source, index) {
  if (source[index] !== '\\' || isEscaped(source, index)) return null;
  const candidate = source.slice(index);
  const doubleMatch = candidate.match(/^\\\\([A-Za-z]+)/);
  const singleMatch = candidate.match(/^\\([A-Za-z]+)/);
  const match = doubleMatch && HIVE_DOUBLE_ESCAPED_COMMANDS.has(doubleMatch[1])
    ? doubleMatch
    : singleMatch;
  if (!match || !BARE_MATH_COMMANDS.has(match[1])) return null;
  let end = index + match[0].length;
  if (BARE_STYLE_COMMANDS.has(match[1])) {
    while (/\s/.test(source[end] || '')) end += 1;
    const groupEnd = readBalancedGroupEnd(source, end);
    if (groupEnd < 0) return null;
    end = groupEnd;
  }
  return { content: source.slice(index, end), end };
}

function sanitizeMathMarkup(value) {
  return sanitizeHtml(value, {
    allowedTags: mathAllowedTags,
    allowedAttributes: {
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
    allowedClasses: {
      span: ['hb-math', 'hb-math--inline'],
      div: ['hb-math', 'hb-math--display'],
    },
    disallowedTagsMode: 'discard',
  });
}

function extractMath(source) {
  const replacements = [];
  let output = '';
  let index = 0;
  let lineStart = true;
  let fence = null;

  function addMath(content, displayMode) {
    const token = `\uE000HIVEBARMATH${replacements.length}TOKEN\uE001`;
    const normalized = normalizeLatexCompatibility(content);
    replacements.push({
      token,
      html: sanitizeMathMarkup(renderLatexMathML(normalized, { displayMode })),
    });
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

      if (!fence) {
        const lineEnd = source.indexOf('\n', index);
        const end = lineEnd >= 0 ? lineEnd : source.length;
        const line = source.slice(index, end);
        const trimmed = line.trim();
        if (
          trimmed &&
          trimmed[0] !== '`' &&
          !/^[#>*+\-]/.test(trimmed) &&
          !/[<>]/.test(trimmed) &&
          looksLikeBareMathFragment(trimmed)
        ) {
          const startOffset = line.indexOf(trimmed);
          output += line.slice(0, startOffset);
          addMath(trimmed, true);
          output += line.slice(startOffset + trimmed.length);
          index = end;
          lineStart = false;
          continue;
        }
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
      const close = findClosingBracketDelimiter(source, index + 2);
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

    if (source[index] === '(' && !isEscaped(source, index)) {
      const close = findClosingDelimiter(source, index + 1, ')', false);
      if (close >= 0) {
        const content = source.slice(index, close + 1);
        if (looksLikeBareMathFragment(content)) {
          addMath(content, false);
          index = close + 1;
          lineStart = false;
          continue;
        }
      }
    }

    const bareAtom = matchBareMathAtom(source, index);
    if (bareAtom) {
      addMath(bareAtom.content, false);
      index = bareAtom.end;
      lineStart = false;
      continue;
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

function sanitizeRenderedContent(rendered) {
  return sanitizeHtml(rendered, {
    allowedTags: contentAllowedTags,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      th: ['align'],
      td: ['align'],
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

function renderMarkdown(value) {
  const source = typeof value === 'string' ? value : '';
  const extracted = extractMath(source);
  let rendered = sanitizeRenderedContent(markdown.render(extracted.source));
  for (const replacement of extracted.replacements) {
    rendered = rendered.split(replacement.token).join(replacement.html);
  }
  return rendered;
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