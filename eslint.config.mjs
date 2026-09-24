const browserGlobals = {
  AbortController: 'readonly',
  Blob: 'readonly',
  CustomEvent: 'readonly',
  Document: 'readonly',
  Element: 'readonly',
  Event: 'readonly',
  EventTarget: 'readonly',
  Headers: 'readonly',
  Input: 'readonly',
  MessageEvent: 'readonly',
  MutationObserver: 'readonly',
  Node: 'readonly',
  Request: 'readonly',
  RequestInfo: 'readonly',
  Response: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  TransformStream: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  WebSocket: 'readonly',
  window: 'readonly',
  document: 'readonly',
  globalThis: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  queueMicrotask: 'readonly',
};

const nodeGlobals = {
  Buffer: 'readonly',
  URL: 'readonly',
  console: 'readonly',
  process: 'readonly',
};

const restrictedGlobals = [
  { name: 'eval', message: 'eval is forbidden.' },
  { name: 'Function', message: 'The Function constructor is forbidden.' },
  { name: 'WebSocket', message: 'WebSocket is forbidden.' },
  { name: 'EventSource', message: 'EventSource is forbidden.' },
  { name: 'XMLHttpRequest', message: 'XMLHttpRequest creation is forbidden.' },
];

const restrictedProperties = [
  { property: 'innerHTML', message: 'innerHTML is forbidden.' },
  { property: 'outerHTML', message: 'outerHTML is forbidden.' },
  { property: 'insertAdjacentHTML', message: 'insertAdjacentHTML is forbidden.' },
  { object: 'document', property: 'write', message: 'document.write is forbidden.' },
  { object: 'document', property: 'writeln', message: 'document.writeln is forbidden.' },
  { object: 'navigator', property: 'sendBeacon', message: 'sendBeacon is forbidden.' },
  { object: 'chrome.storage', property: 'sync', message: 'chrome.storage.sync is forbidden.' },
];

export default [
  {
    ignores: ['dist/**', '.dist/**', 'node_modules/**', 'coverage/**', 'test-results/**'],
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-console': 'error',
      'no-restricted-globals': ['error', ...restrictedGlobals],
      'no-restricted-properties': ['error', ...restrictedProperties],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'Direct fetch calls are forbidden; use the captured page fetch in fetch-patch.js.',
        },
        {
          selector: "NewExpression[callee.name='WebSocket']",
          message: 'WebSocket construction is forbidden.',
        },
        {
          selector: "NewExpression[callee.name='EventSource']",
          message: 'EventSource construction is forbidden.',
        },
        {
          selector: "NewExpression[callee.name='XMLHttpRequest']",
          message: 'XMLHttpRequest construction is forbidden.',
        },
      ],
    },
  },
  {
    files: ['src/shared/log.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: [
      'scripts/**/*.mjs',
      'esbuild.config.mjs',
      'vitest.config.mjs',
      'playwright.config.mjs',
      'eslint.config.mjs',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
];
