import { createJsonDeltaHandler } from '../../core/rehydrate.js';

/** @param {string} hostname */
function isChatGptHost(hostname) {
  return (
    hostname === 'chatgpt.com' || hostname === 'www.chatgpt.com' || hostname === 'chat.openai.com'
  );
}

/** @param {any} input @param {any} init */
function requestMethod(input, init) {
  return String(init?.method ?? input?.method ?? 'GET').toUpperCase();
}

/** @param {any} input */
function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return String(input ?? '');
}

/** @param {any} json */
function contentSlots(json) {
  /** @type {any[]} */
  const slots = [];
  const parts = json?.message?.content?.parts;
  if (!Array.isArray(parts)) return slots;
  parts.forEach((part, index) => {
    if (typeof part !== 'string') return;
    const path = `/message/content/parts/${index}`;
    slots.push({
      key: path,
      mode: 'cumulative',
      get: () => parts[index],
      /** @param {any} value */
      set: (value) => {
        parts[index] = value;
      },
    });
  });
  return slots;
}

/** @param {any} json */
function deltaSlots(json) {
  if (Array.isArray(json?.v)) {
    return json.v
      .map((/** @type {any} */ value, /** @type {number} */ index) => ({ value, index }))
      .filter((/** @type {{value:any,index:number}} */ item) => typeof item.value === 'string')
      .map((/** @type {{value:any,index:number}} */ item) => ({
        key: typeof json.p === 'string' ? json.p : '/message/content/parts/0',
        mode: 'delta',
        get: () => json.v[item.index],
        /** @param {any} value */
        set: (value) => {
          json.v[item.index] = value;
        },
      }));
  }
  if (typeof json?.v !== 'string') return [];
  const key = typeof json.p === 'string' ? json.p : '/message/content/parts/0';
  if (!key.includes('/content/parts/')) return [];
  return [
    {
      key,
      mode: json.o === 'replace' ? 'cumulative' : 'delta',
      get: () => json.v,
      /** @param {any} value */
      set: (value) => {
        json.v = value;
      },
    },
  ];
}

/** @param {any} json */
function locate(json) {
  const cumulative = contentSlots(json);
  if (cumulative.length > 0) return cumulative;
  return deltaSlots(json);
}

/** @param {string} key @param {string} text */
function makeFlushEvent(key, text) {
  return { data: JSON.stringify({ p: key, o: 'append', v: text }) };
}

/** @param {any} event */
function isTerminalEvent(event) {
  return event?.data === '[DONE]';
}

export const chatgptAdapter = /** @type {any} */ ({
  id: 'chatgpt',
  matchesHost: isChatGptHost,
  /** @param {any} input @param {any} init */
  matchRequest(input, init) {
    if (requestMethod(input, init) !== 'POST') return false;
    try {
      const candidate = requestUrl(input);
      const base = globalThis.location?.origin;
      const url = base ? new URL(candidate, base) : new URL(candidate);
      return (
        isChatGptHost(url.hostname) && /^\/backend-api\/(?:f\/)?conversation\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  },
  expectedSlotPaths: ['messages[*].content.parts[*]'],
  /** @param {any} json */
  getRequestSlots(json) {
    /** @type {any[]} */
    const slots = [];
    const messages = json?.messages;
    if (!Array.isArray(messages)) return slots;
    messages.forEach((message, messageIndex) => {
      const parts = message?.content?.parts;
      if (!Array.isArray(parts)) return;
      parts.forEach((part, partIndex) => {
        if (typeof part !== 'string') return;
        const path = `messages[${messageIndex}].content.parts[${partIndex}]`;
        slots.push({
          path,
          get: () => parts[partIndex],
          /** @param {any} value */
          set: (value) => {
            parts[partIndex] = value;
          },
        });
      });
    });
    return slots;
  },
  /** @param {any} response */
  matchResponse(response) {
    const contentType = response?.headers?.get?.('content-type') ?? '';
    return contentType.includes('text/event-stream') || contentType.includes('application/json');
  },
  /** @param {any} vault */
  createStreamHandler(vault) {
    const handler = createJsonDeltaHandler({ vault, locate, makeFlushEvent });
    let terminalSeen = false;
    return {
      /** @param {any} event */
      onEvent(event) {
        if (isTerminalEvent(event)) {
          terminalSeen = true;
          return [...handler.onEnd(), event];
        }
        return handler.onEvent(event);
      },
      onEnd() {
        return terminalSeen ? [] : handler.onEnd();
      },
    };
  },
  makeFlushEvent,
  isTerminalEvent,
  composerSelectors: ['#prompt-textarea', '[contenteditable="true"]', 'textarea'],
  /** @param {any} element */
  composerContainer(element) {
    return element?.closest?.('form') ?? element?.parentElement ?? element;
  },
  /** @param {any} element */
  readComposerText(element) {
    return element?.innerText ?? element?.textContent ?? '';
  },
});
