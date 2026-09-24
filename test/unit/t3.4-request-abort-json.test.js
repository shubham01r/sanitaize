import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { Vault } from '../../src/core/vault.js';
import { installFetchPatch } from '../../src/main-world/fetch-patch.js';
import { fakeStripeKey } from '../helpers/fake-secrets.js';

function builtIns() {
  return { Request, Response, Headers, JSON, crypto };
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
    matchRequest: vi.fn(() => true),
    getRequestSlots(json) {
      return [{ get: () => json.text, set: (value) => (json.text = value) }];
    },
    matchResponse: vi.fn(() => true),
    createStreamHandler: vi.fn(),
  };
}

async function sentText(input, init) {
  return typeof init?.body === 'string' ? init.body : await input.clone().text();
}

describe('T3.4 Request, abort, and JSON responses', () => {
  it('rebuilds a Request input and sends only its sanitized body', async () => {
    const real = fakeStripeKey();
    const originalFetch = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const request = new Request('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: real }),
    });
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault: new Vault(),
      runtime: runtime(),
      adapters: { match: () => adapter() },
    });

    await patch.patched(request);
    const [sentInput, sentInit] = originalFetch.mock.calls[0];
    expect(sentInput).toBeInstanceOf(Request);
    expect(sentInit).toBeUndefined();
    const body = JSON.parse(await sentText(sentInput, sentInit));
    expect(body.text).not.toBe(real);
    expect(body.text).toMatch(/^sk_test_/);
  });

  it('propagates an AbortSignal through the rebuilt Request', async () => {
    const controller = new AbortController();
    const originalFetch = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    const request = new Request('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      body: JSON.stringify({ text: 'safe' }),
      signal: controller.signal,
    });
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault: new Vault(),
      runtime: runtime(),
      adapters: { match: () => adapter() },
    });
    await patch.patched(request);
    const sentSignal = originalFetch.mock.calls[0][0].signal;
    expect(sentSignal).toBeDefined();
    expect(sentSignal.aborted).toBe(false);
    controller.abort();
    expect(sentSignal.aborted).toBe(true);
  });

  it('does not transmit a matching request when its signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const originalFetch = vi.fn(async () => new Response('{}'));
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault: new Vault(),
      runtime: runtime(),
      adapters: { match: () => adapter() },
    });
    await expect(
      patch.patched('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        body: JSON.stringify({ text: 'safe' }),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('rehydrates a non-SSE JSON response and fails open for malformed JSON', async () => {
    const vault = new Vault();
    vault.getOrCreate({ type: 'GENERIC_SECRET', value: 'REAL_JSON_VALUE' }, () => ({ mock: 'json-response-mock' }));
    const originalFetch = vi.fn(async () =>
      new Response(JSON.stringify({ text: 'answer json-response-mock' }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault,
      runtime: runtime(),
      adapters: { match: () => adapter() },
    });
    const response = await patch.patched('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      body: JSON.stringify({ text: 'safe' }),
    });
    await expect(response.json()).resolves.toEqual({ text: 'answer REAL_JSON_VALUE' });

    originalFetch.mockResolvedValueOnce(new Response('not-json', { headers: { 'content-type': 'application/json' } }));
    const malformed = await patch.patched('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      body: JSON.stringify({ text: 'safe' }),
    });
    await expect(malformed.text()).resolves.toBe('not-json');
  });
});
