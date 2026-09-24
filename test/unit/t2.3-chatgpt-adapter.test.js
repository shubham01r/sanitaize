import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../src/core/random.js';
import { sanitizeJsonBody } from '../../src/core/sanitize.js';
import { SseParser, serializeSse } from '../../src/core/sse.js';
import { Vault } from '../../src/core/vault.js';
import { chatgptAdapter } from '../../src/main-world/adapters/chatgpt.js';
import { matchAdapter } from '../../src/main-world/adapters/index.js';
import { fakeDbUrl, fakeStripeKey, fakeStripeMock } from '../helpers/fake-secrets.js';

const fixtureDirectory = fileURLToPath(new URL('../fixtures/chatgpt/', import.meta.url));

/** @param {string} name */
async function readText(name) {
  return readFile(join(fixtureDirectory, name), 'utf8');
}

/** @param {string} name */
async function readJson(name) {
  return JSON.parse(await readText(name));
}

function deterministicRandom() {
  return createRandomSource({
    getRandomValues(array) {
      for (let index = 0; index < array.length; index += 1) array[index] = (index * 19 + 7) % 256;
      return array;
    },
  });
}

function vaultWithFixtureMappings() {
  const vault = new Vault();
  vault.getOrCreate({ type: 'STRIPE_KEY', value: fakeStripeKey() }, () => ({
    mock: fakeStripeMock(),
  }));
  vault.getOrCreate({ type: 'DB_URL', value: fakeDbUrl() }, () => ({
    mock: 'postgres://user_fake7q:MockPass7Q9@host-fixture.mock.internal:5432/db_fake7q',
  }));
  return vault;
}

function streamEvents(stream) {
  const parser = new SseParser();
  return [...parser.push(stream), ...parser.end()];
}

function outputText(events) {
  return events
    .map((event) => {
      if (event.data === '[DONE]') return '';
      try {
        return JSON.parse(event.data).v ?? '';
      } catch {
        return '';
      }
    })
    .join('');
}

describe('T2.3 ChatGPT adapter conformance', () => {
  it('matches only the supported URL and method without reading a body', () => {
    const input = {
      url: 'https://chatgpt.com/backend-api/conversation',
      method: 'GET',
      get body() {
        throw new Error('adapter matching must not inspect the body');
      },
    };
    expect(chatgptAdapter.matchRequest(input, { method: 'POST' })).toBe(true);
    expect(chatgptAdapter.matchRequest(input, { method: 'GET' })).toBe(false);
    expect(chatgptAdapter.matchesHost('chat.openai.com')).toBe(true);
    expect(chatgptAdapter.matchesHost('example.invalid')).toBe(false);
  });

  it('matches a relative conversation URL against the page origin', () => {
    const previousLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { origin: 'https://chatgpt.com' },
    });
    try {
      expect(chatgptAdapter.matchRequest('/backend-api/conversation', { method: 'POST' })).toBe(
        true,
      );
    } finally {
      if (previousLocation === undefined) delete globalThis.location;
      else
        Object.defineProperty(globalThis, 'location', {
          configurable: true,
          value: previousLocation,
        });
    }
  });

  it('finds every documented ChatGPT text slot in the Phase 0 request fixture', async () => {
    const body = await readJson('request-follow-up.json');
    const slots = chatgptAdapter.getRequestSlots(body);
    expect(slots.map((slot) => slot.path)).toEqual([
      'messages[0].content.parts[0]',
      'messages[1].content.parts[0]',
      'messages[2].content.parts[0]',
    ]);
    expect(slots.every((slot) => typeof slot.get() === 'string')).toBe(true);
    expect(chatgptAdapter.expectedSlotPaths).toEqual(['messages[*].content.parts[*]']);
  });

  it('sanitizes the fixture without leaving any synthetic real value in JSON', async () => {
    const body = await readJson('request.json');
    const vault = new Vault();
    const result = sanitizeJsonBody(body, chatgptAdapter, {
      vault,
      rand: deterministicRandom(),
    });
    const serialized = JSON.stringify(result.json);
    expect(serialized).not.toContain(fakeStripeKey());
    expect(serialized).not.toContain(fakeDbUrl());
    expect(result.warnings).toEqual([]);
    expect(vault.stats().size).toBeGreaterThan(0);
  });

  it('rehydrates delta and cumulative fixture streams, including split mocks', async () => {
    for (const name of ['stream-delta.sse', 'stream-cumulative.sse']) {
      const stream = await readText(name);
      const handler = chatgptAdapter.createStreamHandler(vaultWithFixtureMappings());
      const output = streamEvents(stream)
        .flatMap((event) => handler.onEvent(event))
        .concat(handler.onEnd());
      const serialized = output.map(serializeSse).join('');
      expect(serialized).toContain('data: [DONE]');
      expect(serialized).not.toContain(fakeStripeMock());
      expect(serialized).toContain(fakeStripeKey());
      expect(serialized).toContain(fakeDbUrl());
    }
  });

  it('rehydrates a mock at every split offset and flushes before DONE', () => {
    const mock = fakeStripeMock();
    const key = '/message/content/parts/0';
    for (let offset = 1; offset < mock.length; offset += 1) {
      const vault = vaultWithFixtureMappings();
      const handler = chatgptAdapter.createStreamHandler(vault);
      const first = handler.onEvent({
        data: JSON.stringify({ p: key, o: 'append', v: mock.slice(0, offset) }),
      });
      const second = handler.onEvent({
        data: JSON.stringify({ p: key, o: 'append', v: mock.slice(offset) }),
      });
      const terminal = handler.onEvent({ data: '[DONE]', raw: 'data: [DONE]\n\n' });
      const flushed = handler.onEnd();
      const events = [...first, ...second, ...terminal, ...flushed];
      const text = outputText(events);
      expect(text).toBe(fakeStripeKey());
      expect(events.at(-1)?.data).toBe('[DONE]');
    }
  });

  it('selects the ChatGPT adapter through the registry', () => {
    expect(matchAdapter('https://chatgpt.com/backend-api/conversation', { method: 'POST' })).toBe(
      chatgptAdapter,
    );
    expect(
      matchAdapter('https://example.invalid/backend-api/conversation', { method: 'POST' }),
    ).toBeNull();
  });

  it('selects JSON responses for non-streaming rehydration', () => {
    const response = new Response('{}', { headers: { 'content-type': 'application/json' } });
    expect(chatgptAdapter.matchResponse(response)).toBe(true);
  });
});
