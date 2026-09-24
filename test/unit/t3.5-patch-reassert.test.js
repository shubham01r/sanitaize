import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import { Vault } from '../../src/core/vault.js';
import { installFetchPatch } from '../../src/main-world/fetch-patch.js';

function runtime() {
  return { getConfig: vi.fn(async () => DEFAULT_CONFIG), paused: false, report: vi.fn(), reportError: vi.fn() };
}

function builtIns() {
  return { Request, Response, Headers, JSON, crypto };
}

function setup() {
  const originalFetch = vi.fn(async () => new Response('ok'));
  const listeners = new Map();
  const documentObject = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const windowObject = { fetch: originalFetch, crypto };
  const onStatus = vi.fn();
  const onWarning = vi.fn();
  const adapter = { matchRequest: vi.fn(() => true), matchResponse: () => false };
  const patch = installFetchPatch({
    windowObject,
    documentObject,
    builtIns: builtIns(),
    vault: new Vault(),
    runtime: runtime(),
    adapters: { match: () => adapter },
    onStatus,
    onWarning,
  });
  return { patch, windowObject, listeners, onStatus, onWarning, originalFetch };
}

describe('T3.5 fetch patch re-assertion', () => {
  it('re-wraps a replaced fetch on visibilitychange and reports status', () => {
    const state = setup();
    const replacement = vi.fn(async () => new Response('replacement'));
    state.windowObject.fetch = replacement;
    state.listeners.get('visibilitychange')?.();
    expect(state.windowObject.fetch).toBe(state.patch.patched);
    expect(state.onWarning).toHaveBeenCalledWith('W_PATCH_REPLACED');
    expect(state.onStatus).toHaveBeenCalledWith({ state: 'ok' });
  });

  it('reports a lost patch when the page fetch property cannot be restored', () => {
    const state = setup();
    const replacement = vi.fn();
    Object.defineProperty(state.windowObject, 'fetch', {
      configurable: true,
      get: () => replacement,
      set: () => {
        throw new Error('read-only');
      },
    });
    state.listeners.get('visibilitychange')?.();
    expect(state.onWarning).toHaveBeenCalledWith('W_PATCH_LOST');
    expect(state.onStatus).toHaveBeenCalledWith({ state: 'lost' });
  });

  it('exposes a metadata-only unpatched-channel note', () => {
    const state = setup();
    state.patch.noteUnpatchedChannel();
    expect(state.onWarning).toHaveBeenCalledWith('W_UNPATCHED_CHANNEL');
  });

  it('does not reassert when the current fetch is the installed patch', () => {
    const state = setup();
    state.listeners.get('visibilitychange')?.();
    expect(state.onWarning).not.toHaveBeenCalled();
    expect(state.onStatus).toHaveBeenCalledWith({ state: 'ok' });
  });
});
