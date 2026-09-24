import { chatgptAdapter } from './chatgpt.js';

/** @param {string} hostname */
function isLocalDevHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** @param {any} input @param {any} init */
function methodIsPost(input, init) {
  return String(init?.method ?? input?.method ?? 'GET').toUpperCase() === 'POST';
}

/** @param {any} input */
function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return String(input ?? '');
}

export const localDevChatgptAdapter = {
  ...chatgptAdapter,
  id: 'local-dev-chatgpt',
  matchesHost: isLocalDevHost,
  /** @param {any} input @param {any} init */
  matchRequest(input, init) {
    if (!methodIsPost(input, init)) return false;
    try {
      const candidate = requestUrl(input);
      const base = globalThis.location?.origin;
      const url = base ? new URL(candidate, base) : new URL(candidate);
      return (
        isLocalDevHost(url.hostname) &&
        /^\/backend-api\/(?:f\/)?conversation\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  },
};
