import { createJsonDeltaHandler } from '../../core/rehydrate.js';

/** @param {string} hostname */
function isClaudeHost(hostname) {
  return hostname === 'claude.ai' || hostname.endsWith('.claude.ai');
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

/** @param {any} input @param {string} base */
function parseUrl(input, base = globalThis.location?.origin) {
  const candidate = requestUrl(input);
  return base ? new URL(candidate, base) : new URL(candidate);
}

/** @param {any} json */
function locate(json) {
  if (typeof json?.completion === 'string') {
    return [
      {
        key: 'completion',
        mode: 'delta',
        get: () => json.completion,
        /** @param {string} value */
        set: (value) => (json.completion = value),
      },
    ];
  }
  if (typeof json?.delta?.text === 'string') {
    return [
      {
        key: 'content_block_delta',
        mode: 'delta',
        get: () => json.delta.text,
        /** @param {string} value */
        set: (value) => (json.delta.text = value),
      },
    ];
  }
  return [];
}

/** @param {string} key @param {string} text */
function makeFlushEvent(key, text) {
  if (key === 'content_block_delta')
    return {
      event: 'content_block_delta',
      data: JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } }),
    };
  return { data: JSON.stringify({ completion: text }) };
}

/** @param {any} event */
function isTerminalEvent(event) {
  if (event?.event === 'message_stop') return true;
  if (event?.data === 'message_stop') return true;
  try {
    return JSON.parse(event?.data ?? '').type === 'message_stop';
  } catch {
    return false;
  }
}

export const claudeAdapter = /** @type {any} */ ({
  id: 'claude',
  matchesHost: isClaudeHost,
  /** @param {any} input @param {any} init */
  matchRequest(input, init) {
    if (!methodIsPost(input, init)) return false;
    try {
      const url = parseUrl(input);
      return (
        isClaudeHost(url.hostname) &&
        /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(?:retry_completion|completion)\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  },
  expectedSlotPaths: ['prompt', 'attachments[*].extracted_content'],
  /** @param {any} json */
  getRequestSlots(json) {
    /** @type {any[]} */
    const slots = [];
    if (typeof json?.prompt === 'string')
      slots.push({
        path: 'prompt',
        get: () => json.prompt,
        /** @param {string} value */
        set: (value) => (json.prompt = value),
      });
    if (Array.isArray(json?.attachments))
      json.attachments.forEach((/** @type {any} */ attachment, /** @type {number} */ index) => {
        if (typeof attachment?.extracted_content !== 'string') return;
        const path = `attachments[${index}].extracted_content`;
        slots.push({
          path,
          get: () => attachment.extracted_content,
          /** @param {string} value */
          set: (value) => (attachment.extracted_content = value),
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
    const delegate = createJsonDeltaHandler({ vault, locate, makeFlushEvent });
    let terminalSeen = false;
    return {
      /** @param {any} event */
      onEvent(event) {
        if (isTerminalEvent(event)) {
          terminalSeen = true;
          return [...delegate.onEnd(), event];
        }
        return delegate.onEvent(event);
      },
      onEnd() {
        return terminalSeen ? [] : delegate.onEnd();
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
    return element?.value ?? element?.innerText ?? element?.textContent ?? '';
  },
});

/** @param {string} hostname */
function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export const localDevClaudeAdapter = {
  ...claudeAdapter,
  id: 'local-dev-claude',
  matchesHost: isLocalHost,
  /** @param {any} input @param {any} init */
  matchRequest(input, init) {
    if (!methodIsPost(input, init)) return false;
    try {
      const url = parseUrl(input);
      return (
        isLocalHost(url.hostname) &&
        /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+\/(?:retry_completion|completion)\/?$/.test(url.pathname)
      );
    } catch {
      return false;
    }
  },
};
