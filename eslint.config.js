'use strict';

const nodeGlobals = {
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  __dirname: 'readonly',
  module: 'readonly',
  process: 'readonly',
  ReadableStream: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  URL: 'readonly',
};

const browserGlobals = {
  console: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  htmx: 'readonly',
  localStorage: 'readonly',
  navigator: 'readonly',
  window: 'readonly',
  URL: 'readonly',
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'public/css/**',
      'public/js/*.min.js',
    ],
  },
  {
    files: ['src/**/*.js', 'routes/**/*.js', 'utils/**/*.js', 'index.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: nodeGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
