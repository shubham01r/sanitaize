import { log } from '../shared/log.js';
import { Vault } from '../core/vault.js';
import { createRandomSource } from '../core/random.js';
import { createRuntime } from './runtime.js';
import { createMainBridge } from './bridge.js';
import { installFetchPatch } from './fetch-patch.js';
import { installXhrPatch } from './xhr-patch.js';
import { matchAdapter } from './adapters/index.js';

/**
 * Capture page built-ins before a site script can replace them.
 * The returned object is intentionally metadata-free.
 * @param {any} windowObject
 */
export function captureBuiltIns(windowObject) {
  return {
    fetch: windowObject.fetch,
    Request: windowObject.Request,
    Response: windowObject.Response,
    Headers: windowObject.Headers,
    Blob: windowObject.Blob,
    ArrayBuffer: windowObject.ArrayBuffer,
    TransformStream: windowObject.TransformStream,
    TextEncoder: windowObject.TextEncoder,
    TextDecoder: windowObject.TextDecoder,
    URL: windowObject.URL,
    Map: windowObject.Map,
    WeakMap: windowObject.WeakMap,
    XMLHttpRequest: windowObject.XMLHttpRequest,
    JSON: { parse: JSON.parse, stringify: JSON.stringify },
    crypto: windowObject.crypto,
    getRandomValues: windowObject.crypto?.getRandomValues?.bind(windowObject.crypto),
    randomUUID: windowObject.crypto?.randomUUID?.bind(windowObject.crypto),
  };
}

/** @param {string} hostname */
function adapterForHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]')
    return 'local-dev-chatgpt';
  if (hostname === 'claude.ai' || hostname.endsWith('.claude.ai')) return 'claude';
  return 'chatgpt';
}

/**
 * Start the main-world shell. Exported for unit tests; Chrome invokes it
 * automatically at document_start when the bundled entry runs.
 * @param {Object} options
 * @param {any} options.windowObject
 * @param {any} options.documentObject
 */
export function startMainWorld({ windowObject, documentObject }) {
  const builtIns = /** @type {any} */ (captureBuiltIns(windowObject));
  const vault = new Vault({ MapClass: builtIns.Map });
  /** @type {any} */
  let bridge;
  /** @type {any} */
  let effectiveConfig = null;
  const applyConfig = (config) => {
    effectiveConfig = config;
    runtime.applyConfig(config);
  };
  const runtime = createRuntime({
    initialConfig: null,
    onReport: (event, payload) => bridge?.send(event, payload),
  });
  const cryptoObject = windowObject.crypto;
  bridge = createMainBridge({
    windowObject,
    channel: cryptoObject?.randomUUID?.() ?? 'sanitaize-main-channel',
    adapterId: adapterForHost(windowObject.location?.hostname ?? ''),
    cryptoObject,
    onConfig: applyConfig,
    onWarning: (type, payload) => runtime.report(type, payload),
    onIgnore: ({ type, valueHash }) => {
      if (!effectiveConfig) return;
      const ignoreHashes = new Set(effectiveConfig.ignoreHashes ?? []);
      ignoreHashes.add(valueHash);
      effectiveConfig = { ...effectiveConfig, ignoreHashes: [...ignoreHashes] };
      runtime.applyConfig(effectiveConfig);
      bridge.send('VAULT_STATS', { ignored: true, type, valueHash });
    },
    onClearVault: () => {
      vault.clear();
      bridge.send('VAULT_STATS', { size: 0, byType: {} });
    },
    onPause: ({ paused, untilMs }) => runtime.setPaused(paused, untilMs),
  });
  builtIns.randomSource = createRandomSource({ getRandomValues: builtIns.getRandomValues });
  const fetchPatch = installFetchPatch({
    windowObject,
    documentObject,
    builtIns,
    vault,
    runtime,
    adapters: { match: matchAdapter },
    onWarning: (code) => bridge.send('WARNING', { code }),
    onStatus: (payload) => bridge.send('PATCH_STATUS', payload),
  });
  const xhrPatch = installXhrPatch({
    windowObject,
    builtIns,
    vault,
    runtime,
    adapters: { match: matchAdapter },
  });
  const root = documentObject?.documentElement;
  if (root) root.dataset.szMain = 'ready';
  log('inject.ready', { world: 'main' });
  return {
    builtIns,
    vault,
    runtime,
    bridge,
    fetchPatch,
    xhrPatch,
    adapterId: adapterForHost(windowObject.location?.hostname ?? ''),
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  startMainWorld({ windowObject: window, documentObject: document });
}
