import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../src/core/random.js';
import { sanitizeJsonBody } from '../../src/core/sanitize.js';
import { SseParser, serializeSse } from '../../src/core/sse.js';
import { Vault } from '../../src/core/vault.js';
import { claudeAdapter, localDevClaudeAdapter } from '../../src/main-world/adapters/claude.js';
import { matchAdapter } from '../../src/main-world/adapters/index.js';
import { fakeDbUrl, fakeStripeKey, fakeStripeMock } from '../helpers/fake-secrets.js';

const directory = fileURLToPath(new URL('../fixtures/claude/', import.meta.url));
const readText = (name) => readFile(join(directory, name), 'utf8');
const readJson = async (name) => JSON.parse(await readText(name));

function random() {
  return createRandomSource({
    getRandomValues(array) {
      for (let i = 0; i < array.length; i += 1) array[i] = (i * 31 + 9) % 256;
      return array;
    },
  });
}

function vault() {
  const result = new Vault();
  result.getOrCreate({ type: 'STRIPE_KEY', value: fakeStripeKey() }, () => ({ mock: fakeStripeMock() }));
  result.getOrCreate({ type: 'DB_URL', value: fakeDbUrl() }, () => ({ mock: 'postgres://user_fake7q:MockPass7Q9@host-fixture.mock.internal:5432/db_fake7q' }));
  return result;
}

function parse(text) {
  const parser = new SseParser();
  return [...parser.push(text), ...parser.end()];
}

function textOf(events) {
  return events.map((event) => {
    try {
      const json = JSON.parse(event.data);
      return json.completion ?? json.delta?.text ?? '';
    } catch {
      return '';
    }
  }).join('');
}

describe('T3.1 Claude adapter', () => {
  it('matches completion and retry endpoints without reading the body', () => {
    const input = { url: 'https://claude.ai/api/organizations/O/chat_conversations/C/completion', get body() { throw new Error('body'); } };
    expect(claudeAdapter.matchRequest(input, { method: 'POST' })).toBe(true);
    expect(claudeAdapter.matchRequest('https://claude.ai/api/organizations/O/chat_conversations/C/retry_completion', { method: 'POST' })).toBe(true);
    expect(claudeAdapter.matchRequest(input, { method: 'GET' })).toBe(false);
    expect(claudeAdapter.matchesHost('claude.ai')).toBe(true);
    expect(claudeAdapter.matchesHost('example.invalid')).toBe(false);
  });

  it('finds prompt and attachment slots and leaves metadata alone', async () => {
    const body = await readJson('request.json');
    const before = JSON.stringify(body);
    const slots = claudeAdapter.getRequestSlots(body);
    expect(slots.map((slot) => slot.path)).toEqual(['prompt', 'attachments[0].extracted_content']);
    expect(claudeAdapter.expectedSlotPaths).toEqual(['prompt', 'attachments[*].extracted_content']);
    slots[0].set(slots[0].get());
    expect(JSON.stringify(body)).toBe(before);
  });

  it('sanitizes fixture text while preserving metadata', async () => {
    const body = await readJson('request.json');
    const result = sanitizeJsonBody(body, claudeAdapter, { vault: new Vault(), rand: random() });
    const serialized = JSON.stringify(result.json);
    expect(serialized).not.toContain(fakeStripeKey());
    expect(serialized).not.toContain(fakeDbUrl());
    expect(result.json.parent_message_uuid).toBe('MESSAGE_ID_REDACTED');
    expect(result.json.files).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('rehydrates the fixture stream and flushes before message_stop', async () => {
    const handler = claudeAdapter.createStreamHandler(vault());
    const output = parse(await readText('stream-delta.sse')).flatMap((event) => handler.onEvent(event));
    const result = [...output, ...handler.onEnd()];
    const serialized = result.map(serializeSse).join('');
    expect(serialized).not.toContain(fakeStripeMock());
    expect(serialized).toContain(fakeStripeKey());
    expect(textOf(result)).toContain(fakeStripeKey());
    expect(result.at(-1)?.data).toContain('message_stop');
  });

  it('rehydrates completion deltas at every split offset', () => {
    const mock = fakeStripeMock();
    for (let offset = 1; offset < mock.length; offset += 1) {
      const handler = claudeAdapter.createStreamHandler(vault());
      const result = [
        ...handler.onEvent({ data: JSON.stringify({ completion: mock.slice(0, offset) }) }),
        ...handler.onEvent({ data: JSON.stringify({ completion: mock.slice(offset) }) }),
        ...handler.onEvent({ event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) }),
        ...handler.onEnd(),
      ];
      expect(textOf(result)).toBe(fakeStripeKey());
      expect(result.at(-1)?.event).toBe('message_stop');
    }
  });

  it('supports Messages-style content block deltas', () => {
    const handler = claudeAdapter.createStreamHandler(vault());
    const mock = fakeStripeMock();
    const result = [
      ...handler.onEvent({ event: 'content_block_delta', data: JSON.stringify({ delta: { text: mock.slice(0, 4) } }) }),
      ...handler.onEvent({ event: 'content_block_delta', data: JSON.stringify({ delta: { text: mock.slice(4) } }) }),
      ...handler.onEvent({ event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) }),
      ...handler.onEnd(),
    ];
    expect(textOf(result)).toBe(fakeStripeKey());
  });

  it('registers production and local adapters', () => {
    expect(matchAdapter('https://claude.ai/api/organizations/o/chat_conversations/c/completion', { method: 'POST' })).toBe(claudeAdapter);
    expect(matchAdapter('http://localhost:4173/api/organizations/o/chat_conversations/c/completion', { method: 'POST' })).toBe(localDevClaudeAdapter);
  });
});
