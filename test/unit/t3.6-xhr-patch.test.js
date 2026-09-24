import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { Vault } from '../../src/core/vault.js';
import { installXhrPatch } from '../../src/main-world/xhr-patch.js';
import { fakeStripeKey } from '../helpers/fake-secrets.js';

class FakeXhr {
  constructor() {
    this.sent = [];
    this.aborted = false;
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  send(body) {
    this.sent.push(body);
  }

  abort() {
    this.aborted = true;
  }
}

function runtime() {
  return {
    getConfig: vi.fn(async () => DEFAULT_CONFIG),
    paused: false,
    report: vi.fn(),
    reportError: vi.fn(),
  };
}

function adapter() {
  return {
    id: 'chatgpt',
    matchRequest(input, init) {
      return String(init?.method ?? input?.method ?? 'GET').toUpperCase() === 'POST' && String(input).includes('/backend-api/conversation');
    },
    getRequestSlots(json) {
      return [{ get: () => json.text, set: (value) => (json.text = value) }];
    },
  };
}

function setup() {
  const windowObject = { XMLHttpRequest: FakeXhr };
  const adapter = {
    id: 'chatgpt',
    matchRequest(input, init) {
      return (
        String(init?.method ?? input?.method ?? 'GET').toUpperCase() === 'POST' &&
        String(input).includes('/backend-api/conversation')
      );
    },
    getRequestSlots(json) {
      return [{ get: () => json.text, set: (value) => (json.text = value) }];
    },
  };
  const patch = installXhrPatch({
    windowObject,
    builtIns: { JSON, crypto },
    vault: new Vault(),
    runtime: runtime(),
    adapters: {
      match: (input, init) =>
        String(init?.method ?? 'GET').toUpperCase() === 'POST' &&
        String(input).includes('/backend-api/conversation')
          ? adapter
          : null,
    },
  });
  return { patch, windowObject };
}

describe('T3.6 XHR outbound patch', () => {
  it('sanitizes a string body on a matched endpoint', async () => {
    const { patch, windowObject } = setup();
    const xhr = new windowObject.XMLHttpRequest();
    const real = fakeStripeKey();
    xhr.open('POST', 'https://chatgpt.com/backend-api/conversation');
    xhr.send(JSON.stringify({ text: real }));
    await vi.waitFor(() => expect(xhr.sent).toHaveLength(1));
    expect(xhr.sent[0]).not.toContain(real);
    expect(xhr.sent[0]).toMatch(/sk_test_/);
    patch.restore();
  });

  it('passes non-matching XHR calls through unchanged', () => {
    const { patch, windowObject } = setup();
    const xhr = new windowObject.XMLHttpRequest();
    const body = JSON.stringify({ text: fakeStripeKey() });
    xhr.open('GET', 'https://example.invalid/data');
    xhr.send(body);
    expect(xhr.sent).toEqual([body]);
    patch.restore();
  });

  it('blocks a matched malformed JSON body without calling the original send', async () => {
    const { patch, windowObject } = setup();
    const xhr = new windowObject.XMLHttpRequest();
    xhr.open('POST', 'https://chatgpt.com/backend-api/conversation');
    xhr.send('{bad');
    await vi.waitFor(() => expect(xhr.aborted).toBe(true));
    patch.restore();
  });
});
