import { describe, expect, it, vi } from 'vitest';
import { createSanitaizeError } from '../../src/core/errors.js';
import { sanitizeText } from '../../src/core/sanitize.js';
import { LIMITS, DEFAULT_CONFIG } from '../../src/core/types.js';
import { Vault } from '../../src/core/vault.js';
import { installFetchPatch, wrapResponse } from '../../src/main-world/fetch-patch.js';
import { fakeStripeKey } from '../helpers/fake-secrets.js';

function builtIns() {
  return { Request, Response, Headers, Blob, ArrayBuffer, JSON, crypto };
}

function runtime(overrides = {}) {
  return { getConfig: vi.fn(async () => DEFAULT_CONFIG), paused: false, report: vi.fn(), reportError: vi.fn(), ...overrides };
}

function adapterFor(body, overrides = {}) {
  return {
    id: 'chatgpt',
    matchRequest: vi.fn(() => true),
    getRequestSlots: vi.fn(() => [{ get: () => body.text, set: (value) => (body.text = value) }]),
    matchResponse: vi.fn(() => false),
    ...overrides,
  };
}

function patchFor(adapter, runtimeState, vault = new Vault()) {
  const originalFetch = vi.fn(async () => new Response('ok'));
  const patch = installFetchPatch({
    windowObject: { fetch: originalFetch, crypto },
    builtIns: builtIns(),
    vault,
    runtime: runtimeState,
    adapters: { match: () => adapter },
  });
  return { patch, originalFetch };
}

describe('T3.3 outbound fault injection', () => {
  it.each([
    ['E_PARSE_BODY', '{"text":', { body: '{"text":' }],
    ['E_UNSUPPORTED_BODY', 'unsupported', { body: new FormData() }],
  ])('blocks %s before the page fetch', async (code, _label, init) => {
    const body = { text: fakeStripeKey() };
    const { patch, originalFetch } = patchFor(adapterFor(body), runtime());
    await expect(
      patch.patched('https://chatgpt.com/backend-api/conversation', { method: 'POST', ...init }),
    ).rejects.toMatchObject({ name: 'TypeError', code });
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('blocks E_CONFIG_TIMEOUT before reading or sending a body', async () => {
    const { patch, originalFetch } = patchFor(
      adapterFor({ text: fakeStripeKey() }),
      runtime({ getConfig: vi.fn(async () => { throw createSanitaizeError('E_CONFIG_TIMEOUT'); }) }),
    );
    await expect(
      patch.patched('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        body: JSON.stringify({ text: fakeStripeKey() }),
      }),
    ).rejects.toMatchObject({ name: 'TypeError', code: 'E_CONFIG_TIMEOUT' });
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('blocks E_LEAK_ASSERT when a slot refuses the sanitized write', async () => {
    const body = { text: fakeStripeKey() };
    const adapter = adapterFor(body, { getRequestSlots: () => [{ get: () => body.text, set: () => {} }] });
    const { patch, originalFetch } = patchFor(adapter, runtime());
    await expect(
      patch.patched('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    ).rejects.toMatchObject({ name: 'TypeError', code: 'E_LEAK_ASSERT' });
    expect(originalFetch).not.toHaveBeenCalled();
  });

  it('blocks E_VAULT_FULL and E_MOCK_COLLISION', async () => {
    const fullVault = new Vault({ maxEntries: 0 });
    const full = patchFor(adapterFor({ text: fakeStripeKey() }), runtime(), fullVault);
    await expect(
      full.patch.patched('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        body: JSON.stringify({ text: fakeStripeKey() }),
      }),
    ).rejects.toMatchObject({ name: 'TypeError', code: 'E_VAULT_FULL' });

    const collisionVault = new Vault();
    collisionVault.getOrCreate = () => { throw createSanitaizeError('E_MOCK_COLLISION'); };
    const collision = patchFor(adapterFor({ text: fakeStripeKey() }), runtime(), collisionVault);
    await expect(
      collision.patch.patched('https://chatgpt.com/backend-api/conversation', {
        method: 'POST',
        body: JSON.stringify({ text: fakeStripeKey() }),
      }),
    ).rejects.toMatchObject({ name: 'TypeError', code: 'E_MOCK_COLLISION' });
    expect(full.originalFetch).not.toHaveBeenCalled();
    expect(collision.originalFetch).not.toHaveBeenCalled();
  });

  it('enforces E_INPUT_TOO_LARGE in the pure core', () => {
    expect(() => sanitizeText('x'.repeat(LIMITS.MAX_SCAN_CHARS + 1), { vault: new Vault() })).toThrow(
      expect.objectContaining({ code: 'E_INPUT_TOO_LARGE' }),
    );
  });

  it('passes malformed inbound SSE through and reports W_STREAM_PARSE', async () => {
    const adapter = {
      createStreamHandler: () => ({
        onEvent: () => {
          throw new Error('malformed provider event');
        },
        onEnd: () => [],
      }),
    };
    const onWarning = vi.fn();
    const response = new Response('data: not-json\n\n', {
      headers: { 'content-type': 'text/event-stream' },
    });
    const wrapped = await wrapResponse(response, adapter, new Vault(), builtIns(), onWarning);
    await expect(wrapped.text()).resolves.toContain('not-json');
    expect(onWarning).toHaveBeenCalledWith('W_STREAM_PARSE');
  });

  it('uses the explicit fail-open mode only after reporting a blocked transform', async () => {
    const body = { text: fakeStripeKey() };
    const originalFetch = vi.fn(async () => new Response('ok'));
    const report = vi.fn();
    const reportError = vi.fn();
    const adapter = adapterFor(body, {
      getRequestSlots: () => {
        throw createSanitaizeError('E_TRANSFORM_FAIL');
      },
    });
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: builtIns(),
      vault: new Vault(),
      runtime: {
        getConfig: vi.fn(async () => ({ ...DEFAULT_CONFIG, failMode: 'open' })),
        paused: false,
        report,
        reportError,
      },
      adapters: { match: () => adapter },
    });
    const input = 'https://chatgpt.com/backend-api/conversation';
    const init = { method: 'POST', body: JSON.stringify(body) };
    await patch.patched(input, init);
    expect(originalFetch).toHaveBeenCalledWith(input, init);
    expect(report).toHaveBeenCalledWith('BLOCKED', expect.objectContaining({ code: 'E_TRANSFORM_FAIL' }));
  });
});
