import { describe, expect, it, vi } from 'vitest';
import { sanitizeJsonBody } from '../../src/core/sanitize.js';
import { Vault } from '../../src/core/vault.js';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { installFetchPatch } from '../../src/main-world/fetch-patch.js';
import { fakeDbUrl, fakeStripeKey } from '../helpers/fake-secrets.js';

function context() {
  return { vault: new Vault(), config: DEFAULT_CONFIG };
}

describe('T3.2 unknown-shape deep walk', () => {
  it('walks renamed string leaves and emits only the compatibility warning', () => {
    const body = {
      conversation: {
        items: [{ id: 'MESSAGE_ID_REDACTED', text: `Use ${fakeStripeKey()} and ${fakeDbUrl()}` }],
      },
      stream: true,
    };
    const result = sanitizeJsonBody(body, { getRequestSlots: () => [] }, context());
    const serialized = JSON.stringify(result.json);
    expect(result.warnings).toEqual(['W_ADAPTER_UNKNOWN_SHAPE']);
    expect(serialized).not.toContain(fakeStripeKey());
    expect(serialized).not.toContain(fakeDbUrl());
    expect(result.json.conversation.items[0].id).toBe('MESSAGE_ID_REDACTED');
    expect(result.replacements.every((item) => !('real' in item))).toBe(true);
  });

  it('supports a renamed root string without treating it as an id', () => {
    const result = sanitizeJsonBody(`key=${fakeStripeKey()}`, { getRequestSlots: () => [] }, context());
    expect(result.warnings).toContain('W_ADAPTER_UNKNOWN_SHAPE');
    expect(result.json).not.toContain(fakeStripeKey());
  });

  it('relays W_ADAPTER_UNKNOWN_SHAPE from fetch without blocking the request', async () => {
    const originalFetch = vi.fn(async () => new Response('ok'));
    const report = vi.fn();
    const adapter = {
      id: 'chatgpt',
      matchRequest: () => true,
      getRequestSlots: () => [],
      matchResponse: () => false,
    };
    const patch = installFetchPatch({
      windowObject: { fetch: originalFetch, crypto },
      builtIns: { Request, Response, Headers, JSON, crypto },
      vault: new Vault(),
      runtime: { getConfig: async () => DEFAULT_CONFIG, paused: false, report, reportError: vi.fn() },
      adapters: { match: () => adapter },
    });
    await patch.patched('https://chatgpt.com/backend-api/conversation', {
      method: 'POST',
      body: JSON.stringify({ renamed: `key=${fakeStripeKey()}` }),
    });
    expect(report).toHaveBeenCalledWith('WARNING', { code: 'W_ADAPTER_UNKNOWN_SHAPE' });
    expect(originalFetch).toHaveBeenCalledTimes(1);
    patch.restore();
  });
});
