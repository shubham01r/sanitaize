import { describe, expect, it } from 'vitest';
import {
  StreamRehydrator,
  createJsonDeltaHandler,
  replaceMocks,
} from '../../src/core/rehydrate.js';
import { createJsonDeltaHandler as createJsonDeltaHandlerFromModule } from '../../src/core/json-delta.js';
import { Vault } from '../../src/core/vault.js';
import { serializeSse } from '../../src/core/sse.js';

function vaultWith(real, mock) {
  const vault = new Vault();
  vault.getOrCreate({ type: 'GENERIC_SECRET', value: real }, () => ({ mock }));
  return vault;
}

describe('T1.8 stream re-hydration', () => {
  it('replaces complete mocks through the documented helper', () => {
    const vault = vaultWith('REAL', 'MOCK-TOKEN');
    expect(replaceMocks('a MOCK-TOKEN b', vault)).toBe('a REAL b');
  });

  it('exposes the JSON-delta handler from its documented module', () => {
    expect(createJsonDeltaHandlerFromModule).toBe(createJsonDeltaHandler);
  });

  it('holds a possible mock prefix and flushes it without losing characters', () => {
    const vault = vaultWith('REAL-VALUE', 'MOCK-TOKEN-123');
    const rehydrator = new StreamRehydrator(vault);
    expect(rehydrator.push('prefix MOCK-')).toBe('prefix ');
    expect(rehydrator.push('TOK')).toBe('');
    expect(rehydrator.flush()).toBe('MOCK-TOK');
  });

  it('rehydrates a mock split at every byte offset', () => {
    const mock = 'split-safe-mock-42';
    const expected = `before ${'REAL'} after`;
    for (let offset = 1; offset < mock.length; offset += 1) {
      const vault = vaultWith('REAL', mock);
      const rehydrator = new StreamRehydrator(vault);
      const output =
        rehydrator.push(`before ${mock.slice(0, offset)}`) +
        rehydrator.push(`${mock.slice(offset)} after`) +
        rehydrator.flush();
      expect(output).toBe(expected);
    }
  });

  it('handles three-way splits without losing trailing text', () => {
    const vault = vaultWith('REAL', 'three-way-token');
    const rehydrator = new StreamRehydrator(vault);
    const output =
      rehydrator.push('three-') +
      rehydrator.push('way-') +
      rehydrator.push('token tail') +
      rehydrator.flush();
    expect(output).toBe('REAL tail');
  });

  it('processes delta JSON events and flushes before the terminal event', () => {
    const vault = vaultWith('REAL', 'split-token');
    const makeFlushEvent = (key, text) => ({
      data: JSON.stringify({ p: key, o: 'append', v: text }),
    });
    const handler = createJsonDeltaHandler({
      vault,
      locate: (json) => [
        {
          key: '/message/content/parts/0',
          mode: 'delta',
          get: () => json.v,
          set: (value) => (json.v = value),
        },
      ],
      makeFlushEvent,
    });
    const first = handler.onEvent({ data: JSON.stringify({ v: 'split-' }) });
    const second = handler.onEvent({ data: JSON.stringify({ v: 'token' }) });
    const terminal = { data: '[DONE]' };
    const flushed = handler.onEnd();
    expect(JSON.parse(first[0].data).v).toBe('');
    expect(JSON.parse(second[0].data).v).toBe('REAL');
    expect(flushed).toEqual([]);
    expect(terminal.data).toBe('[DONE]');
  });

  it('preserves an empty delta event instead of dropping it', () => {
    const vault = vaultWith('REAL', 'token');
    const handler = createJsonDeltaHandler({
      vault,
      locate: (json) => [
        { key: '/text', mode: 'delta', get: () => json.v, set: (value) => (json.v = value) },
      ],
      makeFlushEvent: (key, text) => ({ data: JSON.stringify({ p: key, o: 'append', v: text }) }),
    });
    const output = handler.onEvent({ data: JSON.stringify({ v: '' }) });
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0].data).v).toBe('');
  });

  it('passes terminal events through unchanged', () => {
    const vault = vaultWith('REAL', 'token');
    const handler = createJsonDeltaHandler({ vault, locate: () => [] });
    const terminal = { data: '[DONE]', raw: 'data: [DONE]\n\n' };
    expect(handler.onEvent(terminal)).toEqual([terminal]);
    expect(serializeSse(handler.onEvent(terminal)[0])).toBe(terminal.raw);
  });
});
