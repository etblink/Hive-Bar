'use strict';

const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

const allowedTags = [
  'p',
  'br',
  'strong',
  'em',
  's',
  'blockquote',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'img',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

function renderMarkdown(value) {
  const source = typeof value === 'string' ? value : '';
  const rendered = markdown.render(source);

  return sanitizeHtml(rendered, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
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
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }),
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
  renderMarkdown,
};
