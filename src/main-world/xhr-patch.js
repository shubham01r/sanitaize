import { createSanitaizeError } from '../core/errors.js';
import { sanitizeJsonBody } from '../core/sanitize.js';

/** @param {any} error */
function errorCode(error) {
  return typeof error?.code === 'string' ? error.code : 'E_TRANSFORM_FAIL';
}

/** @param {any} xhr */
function abortXhr(xhr) {
  try {
    xhr.abort?.();
  } catch {
    // A failed abort must not rethrow page data or break the host page.
  }
}

/**
 * Patch the existing XMLHttpRequest prototype. The extension never constructs an
 * XMLHttpRequest; it only wraps methods on the page-provided constructor.
 * @param {Object} options
 * @param {any} options.windowObject
 * @param {any} options.builtIns
 * @param {any} options.vault
 * @param {any} options.runtime
 * @param {{match:(input:any,init:any)=>any}} options.adapters
 */
export function installXhrPatch(options) {
  const { windowObject, builtIns, vault, runtime, adapters } = options;
  const XhrClass = builtIns.XMLHttpRequest ?? windowObject.XMLHttpRequest;
  const prototype = XhrClass?.prototype;
  const originalOpen = prototype?.open;
  const originalSend = prototype?.send;
  if (!prototype || typeof originalOpen !== 'function' || typeof originalSend !== 'function') {
    return { restore() {} };
  }

  const WeakMapClass = builtIns.WeakMap ?? WeakMap;
  const states = new WeakMapClass();
  const JSONClass = builtIns.JSON ?? JSON;

  /**
   * @this {any}
   * @param {any} method
   * @param {any} url
   * @param {...any} rest
   */
  const patchedOpen = function open(method, url, ...rest) {
    states.set(this, { method: String(method ?? 'GET').toUpperCase(), url: String(url ?? '') });
    return originalOpen.call(this, method, url, ...rest);
  };

  /** @this {any} @param {any} body */
  const patchedSend = function send(body) {
    const state = states.get(this);
    /** @type {any} */
    let adapter = null;
    try {
      adapter = state ? adapters.match(state.url, { method: state.method }) : null;
    } catch (error) {
      runtime.reportError(error);
      runtime.report('BLOCKED', { requestId: 'metadata-only', code: errorCode(error) });
      abortXhr(this);
      return;
    }
    if (!adapter) return originalSend.call(this, body);
    if (runtime.paused) return originalSend.call(this, body);

    const xhr = this;
    void (async () => {
      let config = null;
      try {
        config = await runtime.getConfig(2000);
        if (!config?.enabled || config?.sites?.[adapter.id] === false) {
          originalSend.call(xhr, body);
          return;
        }
        if (typeof body !== 'string') throw createSanitaizeError('E_UNSUPPORTED_BODY');
        let json;
        try {
          json = JSONClass.parse(body);
        } catch {
          throw createSanitaizeError('E_PARSE_BODY');
        }
        const result = sanitizeJsonBody(json, adapter, {
          vault,
          config,
          rand: builtIns.randomSource,
        });
        for (const warning of result.warnings) runtime.report('WARNING', { code: warning });
        runtime.report('TRANSFORM_SUMMARY', {
          requestId: 'metadata-only',
          counts: result.counts,
          latencyMs: result.latencyMs,
          items: result.replacements,
        });
        originalSend.call(xhr, JSONClass.stringify(result.json));
      } catch (error) {
        runtime.reportError(error);
        runtime.report('BLOCKED', { requestId: 'metadata-only', code: errorCode(error) });
        if (config?.failMode === 'open') originalSend.call(xhr, body);
        else abortXhr(xhr);
      }
    })();
  };

  prototype.open = patchedOpen;
  prototype.send = patchedSend;
  return {
    restore() {
      if (prototype.open === patchedOpen) prototype.open = originalOpen;
      if (prototype.send === patchedSend) prototype.send = originalSend;
    },
  };
}
