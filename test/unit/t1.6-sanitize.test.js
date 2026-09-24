import { describe, expect, it } from 'vitest';
import { assertNoLeak, sanitizeJsonBody, sanitizeText } from '../../src/core/sanitize.js';
import { Vault } from '../../src/core/vault.js';
import { fakeDbUrl, fakeEmail, fakeStripeKey } from '../helpers/fake-secrets.js';
import { createRandomSource } from '../../src/core/random.js';

const random = createRandomSource({
  getRandomValues(array) {
    for (let index = 0; index < array.length; index += 1) array[index] = (index * 29 + 11) % 256;
    return array;
  },
});

function context() {
  return { vault: new Vault(), rand: random, sourceText: '' };
}

describe('T1.6 sanitiser', () => {
  it('replaces detected values from right to left and returns safe metadata', () => {
    const input = `Debug ${fakeStripeKey()} with ${fakeDbUrl()} and ${fakeEmail()}.`;
    const ctx = context();
    ctx.sourceText = input;
    const result = sanitizeText(input, ctx);
    expect(result.text).not.toContain(fakeStripeKey());
    expect(result.text).not.toContain(fakeDbUrl());
    expect(result.text).not.toContain(fakeEmail());
    expect(result.replacements.length).toBeGreaterThanOrEqual(3);
    expect(result.replacements.every((item) => !('real' in item))).toBe(true);
    expect(result.counts.STRIPE_KEY).toBe(1);
  });

  it('is idempotent when sanitized text is processed again', () => {
    const ctx = context();
    const first = sanitizeText(`key=${fakeStripeKey()}`, ctx);
    const second = sanitizeText(first.text, ctx);
    expect(second.text).toBe(first.text);
    expect(second.replacements).toHaveLength(0);
  });

  it('sanitizes adapter-provided JSON slots', () => {
    const body = { messages: [{ content: { parts: [fakeStripeKey()] } }] };
    const adapter = {
      getRequestSlots() {
        return [
          {
            get: () => body.messages[0].content.parts[0],
            set: (value) => (body.messages[0].content.parts[0] = value),
          },
        ];
      },
    };
    const result = sanitizeJsonBody(body, adapter, context());
    expect(result.json.messages[0].content.parts[0]).not.toContain(fakeStripeKey());
    expect(JSON.stringify(result.json)).not.toContain(fakeStripeKey());
  });

  it('falls back to deep-walking string leaves when expected slots are absent', () => {
    const body = { renamed: { text: fakeEmail() }, metadata: { id: 'KEEP_ID' } };
    const result = sanitizeJsonBody(body, { getRequestSlots: () => [] }, context());
    expect(result.json.renamed.text).not.toContain(fakeEmail());
    expect(result.warnings).toContain('W_ADAPTER_UNKNOWN_SHAPE');
  });

  it('detects raw and JSON-escaped leaks', () => {
    expect(() => assertNoLeak('prefix secret-value suffix', ['secret-value'])).toThrow();
    expect(() =>
      assertNoLeak(JSON.stringify({ value: 'line1\\nline2' }), ['line1\\nline2']),
    ).toThrow();
    expect(() => assertNoLeak('safe body', ['secret-value'])).not.toThrow();
  });

  it('fails closed when a final body still contains a detected real value', () => {
    const body = { text: fakeStripeKey() };
    const adapter = {
      getRequestSlots() {
        return [{ get: () => body.text, set: () => {} }];
      },
    };
    expect(() => sanitizeJsonBody(body, adapter, context())).toThrow();
  });
});
