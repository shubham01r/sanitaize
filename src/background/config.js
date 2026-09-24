import { DEFAULT_CONFIG } from '../core/types.js';

/** @returns {any} */
export function getEffectiveConfig() {
  return {
    ...DEFAULT_CONFIG,
    sites: { ...DEFAULT_CONFIG.sites },
    detectors: { ...DEFAULT_CONFIG.detectors },
    dictionary: [...DEFAULT_CONFIG.dictionary],
    ignoreHashes: [...DEFAULT_CONFIG.ignoreHashes],
    ui: { badge: true, toasts: true },
    idleClearMinutes: 0,
    allowPause: true,
    lockedKeys: [],
    debug: false,
  };
}

/**
 * @param {any} message
 * @param {any} sender
 * @param {any} extensionApi
 * @returns {{ok:boolean,config?:any}}
 */
export function handleRuntimeMessage(message, sender, extensionApi) {
  if (message?.type === 'GET_EFFECTIVE_CONFIG') return { ok: true, config: getEffectiveConfig() };
  if (message?.type === 'SET_ACTION_BADGE') {
    const count = Number.isFinite(message.count) ? Math.max(0, Math.trunc(message.count)) : 0;
    const tabId = sender?.tab?.id;
    if (tabId !== undefined && typeof extensionApi?.action?.setBadgeText === 'function') {
      extensionApi.action.setBadgeText({ tabId, text: count === 0 ? '' : String(count) });
    }
    return { ok: true };
  }
  if (message?.type === 'AUDIT_APPEND') return { ok: true };
  return { ok: false };
}

/** @param {any} [extensionApi] */
export function registerServiceWorker(extensionApi) {
  const runtimeGlobal = /** @type {{chrome?: any}} */ (globalThis);
  const api = extensionApi ?? runtimeGlobal.chrome;
  if (typeof api?.runtime?.onMessage?.addListener === 'function') {
    api.runtime.onMessage.addListener(
      (/** @type {any} */ message, /** @type {any} */ sender, /** @type {any} */ sendResponse) => {
        const response = handleRuntimeMessage(message, sender, api);
        if (typeof sendResponse === 'function') {
          sendResponse(response);
          return false;
        }
        return response;
      },
    );
  }
}
