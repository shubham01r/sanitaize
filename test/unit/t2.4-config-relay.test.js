import { describe, expect, it, vi } from 'vitest';
import { createMainBridge } from '../../src/main-world/bridge.js';
import { createContentBridge } from '../../src/main-world/bridge.js';
import { startContent } from '../../src/content/content.js';
import { getEffectiveConfig, handleRuntimeMessage } from '../../src/background/config.js';
import { registerServiceWorker } from '../../src/background/service-worker.js';

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

function envelope(overrides = {}) {
  return {
    source: 'sanitaize',
    v: 1,
    channel: 'channel-under-test',
    dir: 'to-content',
    type: 'READY',
    id: 'message-under-test',
    payload: {},
    ...overrides,
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('T2.4 effective configuration and relay', () => {
  it('returns the documented defaults without reading storage', () => {
    const config = getEffectiveConfig();
    expect(config).toMatchObject({
      enabled: true,
      sites: { chatgpt: true, claude: true },
      failMode: 'closed',
      sensitivity: 'balanced',
      ui: { badge: true, toasts: true },
      idleClearMinutes: 0,
      allowPause: true,
      lockedKeys: [],
      debug: false,
    });
    expect(config.dictionary).toEqual([]);
  });

  it('handles GET_EFFECTIVE_CONFIG and metadata-only badge/audit messages', () => {
    const setBadgeText = vi.fn();
    const extensionApi = { action: { setBadgeText } };
    expect(
      handleRuntimeMessage({ type: 'GET_EFFECTIVE_CONFIG' }, { tab: { id: 9 } }, extensionApi),
    ).toEqual({
      ok: true,
      config: getEffectiveConfig(),
    });

    expect(
      handleRuntimeMessage(
        { type: 'SET_ACTION_BADGE', count: 2 },
        { tab: { id: 9 } },
        extensionApi,
      ),
    ).toEqual({ ok: true });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 9, text: '2' });

    expect(
      handleRuntimeMessage(
        {
          type: 'AUDIT_APPEND',
          entry: { action: 'transform', counts: { STRIPE_KEY: 1 }, latencyMs: 3 },
        },
        { tab: { id: 9 } },
        extensionApi,
      ),
    ).toEqual({ ok: true });
  });

  it('registers one runtime message listener and responds through sendResponse', () => {
    const listeners = [];
    const addListener = vi.fn((listener) => listeners.push(listener));
    const response = { ok: true, config: getEffectiveConfig() };
    const sendResponse = vi.fn();
    registerServiceWorker({ runtime: { onMessage: { addListener } } });
    expect(addListener).toHaveBeenCalledTimes(1);
    listeners[0]({ type: 'GET_EFFECTIVE_CONFIG' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(response);
  });

  it('pushes defaults after HELLO and relays only summary metadata', async () => {
    const windowObject = fakeWindow();
    const sentToWorker = [];
    const runtimeApi = {
      sendMessage: vi.fn(async (message) => {
        sentToWorker.push(message);
        return { ok: true, config: getEffectiveConfig() };
      }),
    };
    const documentObject = { documentElement: { dataset: {} } };
    const content = startContent({ windowObject, documentObject, runtimeApi });
    const onConfig = vi.fn();
    const main = createMainBridge({
      windowObject,
      channel: 'channel-under-test',
      adapterId: 'chatgpt',
      cryptoObject: { randomUUID: () => 'message-id' },
      onConfig,
    });

    await settle();
    expect(sentToWorker[0]).toEqual({ type: 'GET_EFFECTIVE_CONFIG' });
    expect(windowObject.posted.some((message) => message.type === 'CONFIG_PUSH')).toBe(true);
    expect(onConfig).toHaveBeenCalledWith(getEffectiveConfig());
    expect(windowObject.posted.some((message) => message.type === 'READY')).toBe(true);

    windowObject.dispatch('message', {
      source: windowObject,
      data: envelope({
        type: 'TRANSFORM_SUMMARY',
        payload: {
          counts: { STRIPE_KEY: 1, DICTIONARY: 1 },
          latencyMs: 4,
          items: [{ type: 'STRIPE_KEY', valueHash: 'hash', mock: 'FAKE_MOCK' }],
        },
      }),
    });
    await settle();

    const relayed = sentToWorker.slice(1);
    expect(relayed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'SET_ACTION_BADGE', count: 2 }),
        expect.objectContaining({
          type: 'AUDIT_APPEND',
          entry: expect.objectContaining({
            action: 'transform',
            counts: { STRIPE_KEY: 1, DICTIONARY: 1 },
            latencyMs: 4,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(relayed)).not.toContain('items');
    expect(JSON.stringify(relayed)).not.toContain('FAKE_MOCK');
    main.stop();
    content.stop();
    content.bridge.stop();
  });
});
