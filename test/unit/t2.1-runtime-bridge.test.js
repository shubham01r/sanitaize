import { describe, expect, it, vi } from 'vitest';
import { createContentBridge, createMainBridge } from '../../src/main-world/bridge.js';
import { createRuntime } from '../../src/main-world/runtime.js';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { startMainWorld } from '../../src/main-world/inject.js';

function fakeWindow() {
  const listeners = new Map();
  const windowObject = {
    location: { origin: 'https://chatgpt.example' },
    posted: [],
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    postMessage(message) {
      this.posted.push(message);
      for (const listener of listeners.get('message') ?? []) {
        listener({ source: this, data: message });
      }
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
  return windowObject;
}

function deterministicCrypto() {
  let counter = 0;
  return {
    randomUUID: () => `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
  };
}

function envelope(overrides = {}) {
  return {
    source: 'sanitaize',
    v: 1,
    channel: 'channel-under-test',
    dir: 'to-main',
    type: 'HELLO_REQUEST',
    id: 'message-under-test',
    payload: {},
    ...overrides,
  };
}

describe('T2.1 main-world bootstrap', () => {
  it('creates a runtime that times out until config is pushed', async () => {
    vi.useFakeTimers();
    try {
      const runtime = createRuntime({ timeoutMs: 25 });
      const pending = runtime.getConfig(25);
      const rejection = expect(pending).rejects.toMatchObject({ code: 'E_CONFIG_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(25);
      await rejection;
      expect(runtime.ready).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('installs a captured fetch patch through the main-world bootstrap', () => {
    const originalFetch = vi.fn(async () => new Response('ok'));
    const windowObject = {
      fetch: originalFetch,
      crypto,
      location: { hostname: 'chatgpt.com', origin: 'https://chatgpt.com' },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      postMessage: vi.fn(),
    };
    const documentObject = { documentElement: { dataset: {} } };
    const started = startMainWorld({ windowObject, documentObject });
    expect(started.builtIns.fetch).toBe(originalFetch);
    expect(windowObject.fetch).not.toBe(originalFetch);
    expect(typeof windowObject.fetch).toBe('function');
    expect(String(windowObject.fetch)).toContain('[native code]');
    started.bridge.stop();
  });

  it('resolves all waiting requests when config is applied', async () => {
    const runtime = createRuntime({ timeoutMs: 100 });
    const first = runtime.getConfig(100);
    const second = runtime.getConfig(100);
    const config = { ...DEFAULT_CONFIG, failMode: 'closed' };
    runtime.applyConfig(config);
    await expect(first).resolves.toBe(config);
    await expect(second).resolves.toBe(config);
    expect(runtime.ready).toBe(true);
  });

  it('handles a HELLO_REQUEST arriving after the main-world HELLO', () => {
    const windowObject = fakeWindow();
    const onConfig = vi.fn();
    const bridge = createMainBridge({
      windowObject,
      channel: 'channel-under-test',
      adapterId: 'chatgpt',
      cryptoObject: deterministicCrypto(),
      onConfig,
    });

    expect(windowObject.posted[0]).toMatchObject({
      source: 'sanitaize',
      v: 1,
      dir: 'to-content',
      type: 'HELLO',
      payload: { channel: 'channel-under-test', adapterId: 'chatgpt' },
    });

    windowObject.dispatch('message', { source: windowObject, data: envelope() });
    expect(windowObject.posted.at(-1)).toMatchObject({
      type: 'HELLO',
      dir: 'to-content',
    });

    const config = { ...DEFAULT_CONFIG };
    windowObject.dispatch('message', {
      source: windowObject,
      data: envelope({ type: 'CONFIG_PUSH', payload: { config } }),
    });
    expect(onConfig).toHaveBeenCalledWith(config);
    expect(windowObject.posted.at(-1)).toMatchObject({
      type: 'READY',
      payload: { adapterId: 'chatgpt' },
    });
    bridge.stop();
  });

  it('supports the isolated-world request arriving before main-world setup', async () => {
    const windowObject = fakeWindow();
    const onReady = vi.fn();
    const content = createContentBridge({
      windowObject,
      onReady,
      onHello: vi.fn(),
    });
    content.start();
    expect(windowObject.posted[0]).toMatchObject({ type: 'HELLO_REQUEST', dir: 'to-main' });

    const main = createMainBridge({
      windowObject,
      channel: 'channel-under-test',
      adapterId: 'chatgpt',
      cryptoObject: deterministicCrypto(),
      onConfig: vi.fn(),
    });
    windowObject.dispatch('message', {
      source: windowObject,
      data: envelope({ dir: 'to-main', type: 'HELLO_REQUEST' }),
    });
    const config = { ...DEFAULT_CONFIG };
    windowObject.dispatch('message', {
      source: windowObject,
      data: envelope({ dir: 'to-main', type: 'CONFIG_PUSH', payload: { config } }),
    });
    main.stop();
    content.stop();
  });
});
