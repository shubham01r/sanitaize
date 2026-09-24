import { describe, expect, it, vi } from 'vitest';
import { createSanitaizeError } from '../../src/core/errors.js';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { Vault } from '../../src/core/vault.js';
import { sanitizeJsonBody } from '../../src/core/sanitize.js';
import { installFetchPatch } from '../../src/main-world/fetch-patch.js';
import { fakeStripeKey } from '../helpers/fake-secrets.js';

function builtIns() {
  return {
    Request,
    Response,
    Headers,
    Blob,
    ArrayBuffer,
    TransformStream,
    TextDecoder,
    TextEncoder,
    URL,
    JSON,
    crypto,
  };
}

function adapterFor(_body, overrides = {}) {
  return {
    id: 'chatgpt',
    matchRequest: vi.fn(() => true),
    getRequestSlots: vi.fn((json) => [
      {
        path: '/messages/0/content/parts/0',
        get: () => json.text,
        set: (value) => (json.text = value),
      },
    ]),
    matchResponse: vi.fn(() => true),
    ...overrides,
  };
}

function runtime(config = DEFAULT_CONFIG) {
  return {
    getConfig: vi.fn(async () => config),
    paused: false,
    report: vi.fn(),
    reportError: vi.fn(),
  };
}

async function bodyText(input, init) {
  if (typeof init?.body === 'string') return init.body;
  if (typeof input === 'string') return input;
  if (input instanceof Request) return input.clone().text();
  return '';
}

describe('T2.2 fetch patch', () => {
  it('keeps non-matching requests on the original fast path', async () => {
    const originalFetch = vi.fn(async () => new Response('ok'));
    const windowObject = { fetch: originalFetch, crypto };
    const adapters = { match: vi.fn(() => null) };
    const patch = installFetchPatch({
      windowObject,
      builtIns: builtIns(),
      vault: new Vault(),
      runtime: runtime(),
      adapters,
    });
    const input = {
      url: 'https://example.invalid',
      get body() {
        throw new Error('body must not be read');
      },
    };

    await patch.patched(input, { method: 'GET' });

    expect(adapters.match).toHaveBeenCalledTimes(1);
    expect(adapters.match.mock.calls[0][0]).toBe(input);
    expect(originalFetch).toHaveBeenCalledTimes(1);
    expect(originalFetch.mock.calls[0][0]).toBe(input);
    expect(originalFetch.mock.calls[0][1]).toEqual({ method: 'GET' });
    patch.restore();
  });

  it('sanitizes a matching JSON request and sends only the rebuilt body', async () => {
    const body = { text: `key=${fakeStripeKey()}` };
    const originalFetch = vi.fn(async (_input, init) => new Response('ok', { status: 200 }));
    const windowObject = { fetch: originalFetch, crypto };
    const adapter = adapterFor(body);
    const vault = new Vault();
    const patch = installFetchPatch({
      windowObject,
      builtIns: builtIns(),
      vault,
      runtime: runtime(),
      adapters: { match: () => adapter },
    });

    const response = await patch.patched('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const sent = await bodyText(originalFetch.mock.calls[0][0], originalFetch.mock.calls[0][1]);
    const sentJson = JSON.parse(sent);
    expect(response.status).toBe(200);
    expect(sentJson.text).not.toContain(fakeStripeKey());
    expect(sentJson.text).toMatch(/sk_test_mock/);
    expect(vault.stats().size).toBe(1);
    patch.restore();
  });

  it('blocks before calling the page when sanitization fails', async () => {
    const originalFetch = vi.fn(async () => new Response('ok'));
    const adapter = adapterFor(
      { text: 'x' },
      {
        getRequestSlots: vi.fn(() => {
          throw createSanitaizeError('E_TRANSFORM_FAIL');
        }),
      },
    );
    const runtimeState = runtime();
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault: new Vault(),
      runtime: runtimeState,
      adapters: { match: () => adapter },
    });

    await expect(
      patch.patched('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        body: '{"text":"safe"}',
      }),
    ).rejects.toMatchObject({ name: 'TypeError', code: 'E_TRANSFORM_FAIL' });
    expect(runtimeState.report).toHaveBeenCalledWith(
      'BLOCKED',
      expect.objectContaining({ code: 'E_TRANSFORM_FAIL' }),
    );
    expect(originalFetch).not.toHaveBeenCalled();
    patch.restore();
  });

  it('fails closed on a configuration timeout', async () => {
    const originalFetch = vi.fn(async () => new Response('ok'));
    const runtimeState = {
      ...runtime(),
      getConfig: vi.fn(async () => {
        throw createSanitaizeError('E_CONFIG_TIMEOUT');
      }),
    };
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault: new Vault(),
      runtime: runtimeState,
      adapters: { match: () => adapterFor({ text: 'x' }) },
    });

    await expect(
      patch.patched('https://chatgpt.com/backend-api/conversation', { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({ name: 'TypeError', code: 'E_CONFIG_TIMEOUT' });
    expect(runtimeState.report).toHaveBeenCalledWith(
      'BLOCKED',
      expect.objectContaining({ code: 'E_CONFIG_TIMEOUT' }),
    );
    expect(originalFetch).not.toHaveBeenCalled();
    patch.restore();
  });

  it('wraps a non-SSE JSON response and rehydrates its string leaves', async () => {
    const vault = new Vault();
    const mock = 'json-response-mock';
    vault.getOrCreate({ type: 'GENERIC_SECRET', value: 'REAL_JSON_VALUE' }, () => ({ mock }));
    const originalFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ text: `answer ${mock}` }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const adapter = adapterFor({}, { matchResponse: vi.fn(() => true) });
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault,
      runtime: runtime(),
      adapters: { match: () => adapter },
    });

    const response = await patch.patched('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      body: '{"text":"safe"}',
    });
    expect(await response.json()).toEqual({ text: 'answer REAL_JSON_VALUE' });
    patch.restore();
  });

  it('preserves an AbortSignal while rebuilding a Request input', async () => {
    const controller = new AbortController();
    const request = new Request('https://example.invalid', {
      method: 'POST',
      body: '{"text":"value"}',
      signal: controller.signal,
    });
    const { extractBody } = await import('../../src/main-world/fetch-patch.js');
    const extracted = await extractBody(request, {}, builtIns());
    const rebuilt = extracted.rebuild('{"text":"changed"}');
    expect(rebuilt.input.signal.aborted).toBe(false);
    controller.abort();
    expect(rebuilt.input.signal.aborted).toBe(true);
  });

  it('extracts string, Request, Blob, and ArrayBuffer bodies', async () => {
    const { extractBody } = await import('../../src/main-world/fetch-patch.js');
    const b = builtIns();
    const text = '{"text":"value"}';
    const rebuilt = [];
    for (const [kind, input, init] of [
      ['string', 'https://example.invalid', { body: text }],
      [
        'request',
        new Request('https://example.invalid', { method: 'POST', body: text }),
        undefined,
      ],
      ['blob', 'https://example.invalid', { body: new Blob([text]) }],
      ['arraybuffer', 'https://example.invalid', { body: new TextEncoder().encode(text).buffer }],
    ]) {
      const extracted = await extractBody(input, init, b);
      expect(extracted.bodyText).toBe(text);
      rebuilt.push(extracted.rebuild(text));
    }
    expect(rebuilt).toHaveLength(4);
  });
});
