import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRandomSource } from '../../src/core/random.js';
import { sanitizeJsonBody } from '../../src/core/sanitize.js';
import { SseParser, serializeSse } from '../../src/core/sse.js';
import { Vault } from '../../src/core/vault.js';
import { adapters } from '../../src/main-world/adapters/index.js';
import { fakeDbMock, fakeDbUrl, fakeStripeKey, fakeStripeMock } from '../helpers/fake-secrets.js';

const root = fileURLToPath(new URL('../fixtures/', import.meta.url));
const productionAdapters = adapters.filter((adapter) => !adapter.id.startsWith('local-dev-'));

/** @param {string} directory @param {string} name */
async function readText(directory, name) {
  return readFile(join(root, directory, name), 'utf8');
}

/** @param {string} directory @param {string} name */
async function readJson(directory, name) {
  return JSON.parse(await readText(directory, name));
}

function deterministicRandom() {
  return createRandomSource({
    getRandomValues(array) {
      for (let index = 0; index < array.length; index += 1) array[index] = (index * 23 + 5) % 256;
      return array;
    },
  });
}

function fixtureVault() {
  const vault = new Vault();
  vault.getOrCreate({ type: 'STRIPE_KEY', value: fakeStripeKey() }, () => ({ mock: fakeStripeMock() }));
  vault.getOrCreate({ type: 'DB_URL', value: fakeDbUrl() }, () => ({ mock: fakeDbMock() }));
  return vault;
}

function parseStream(text) {
  const parser = new SseParser();
  return [...parser.push(text), ...parser.end()];
}

describe('shared adapter conformance', () => {
  it.each(productionAdapters.map((adapter) => [adapter.id, adapter]))(
    '%s finds slots and sanitizes its request fixture',
    async (id, adapter) => {
      const body = await readJson(id, 'request.json');
      expect(adapter.getRequestSlots(body).length).toBeGreaterThan(0);
      const result = sanitizeJsonBody(body, adapter, { vault: new Vault(), rand: deterministicRandom() });
      const serialized = JSON.stringify(result.json);
      expect(serialized).not.toContain(fakeStripeKey());
      expect(result.warnings).toEqual([]);
    },
  );

  it.each(productionAdapters.map((adapter) => [adapter.id, adapter]))(
    '%s rehydrates its delta stream and preserves terminal ordering',
    async (id, adapter) => {
      const text = await readText(id, 'stream-delta.sse');
      const handler = adapter.createStreamHandler(fixtureVault());
      const events = parseStream(text);
      const output = events.flatMap((event) => handler.onEvent(event)).concat(handler.onEnd());
      const serialized = output.map(serializeSse).join('');
      expect(serialized).not.toContain(fakeStripeMock());
      expect(serialized).toContain(fakeStripeKey());
      expect(output.at(-1)?.data).toMatch(/\[DONE\]|message_stop/);
    },
  );

  it('rehydrates Claude completion deltas split at every byte offset', async () => {
    const claude = productionAdapters.find((adapter) => adapter.id === 'claude');
    const mock = fakeStripeMock();
    for (let offset = 1; offset < mock.length; offset += 1) {
      const handler = claude.createStreamHandler(fixtureVault());
      const first = handler.onEvent({ data: JSON.stringify({ completion: mock.slice(0, offset) }) });
      const second = handler.onEvent({ data: JSON.stringify({ completion: mock.slice(offset) }) });
      const terminal = handler.onEvent({ data: JSON.stringify({ type: 'message_stop' }) });
      const output = [...first, ...second, ...terminal, ...handler.onEnd()];
      const text = output.map((event) => {
        try {
          return JSON.parse(event.data).completion ?? '';
        } catch {
          return '';
        }
      }).join('');
      expect(text).toBe(fakeStripeKey());
      expect(output.at(-1)?.data).toContain('message_stop');
    }
  });
});
