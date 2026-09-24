import { DEFAULT_CONFIG, LIMITS } from '../core/types.js';
import { createSanitaizeError } from '../core/errors.js';

/**
 * @typedef {Object} RuntimeOptions
 * @property {number} [timeoutMs]
 * @property {any} [initialConfig]
 * @property {(callback: () => void, ms: number) => any} [setTimeoutFn]
 * @property {(handle: any) => void} [clearTimeoutFn]
 * @property {(event: string, payload: any) => void} [onReport]
 */

/** @param {RuntimeOptions} [options] */
export function createRuntime(options = {}) {
  const timeoutMs = options.timeoutMs ?? LIMITS.CONFIG_TIMEOUT_MS;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  /** @type {any} */
  let config = options.initialConfig ?? null;
  let isReady = config !== null;
  let paused = false;
  /** @type {number|undefined} */
  let pauseUntilMs;
  /** @type {Array<{resolve:(value:any)=>void,reject:(reason:any)=>void,timer:any}>} */
  const waiters = [];

  /**
   * @param {(value:any) => void} resolve
   * @param {(reason:any) => void} reject
   * @param {any} timer
   * @param {any} value
   * @param {any} error
   */
  const settle = (resolve, reject, timer, value, error) => {
    clearTimeoutFn(timer);
    if (error) reject(error);
    else resolve(value);
  };

  /** @param {any} nextConfig */
  const applyConfig = (nextConfig) => {
    if (!nextConfig || typeof nextConfig !== 'object') return;
    config = nextConfig;
    isReady = true;
    for (const waiter of waiters.splice(0)) {
      settle(waiter.resolve, waiter.reject, waiter.timer, config, null);
    }
  };

  /**
   * @param {number} [requestedTimeoutMs]
   * @returns {Promise<any>}
   */
  const getConfig = (requestedTimeoutMs = timeoutMs) => {
    if (isReady) return Promise.resolve(config);
    const limit = Number.isFinite(requestedTimeoutMs) ? requestedTimeoutMs : timeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeoutFn(() => {
        const index = waiters.findIndex((waiter) => waiter.timer === timer);
        if (index !== -1) waiters.splice(index, 1);
        reject(createSanitaizeError('E_CONFIG_TIMEOUT'));
      }, limit);
      waiters.push({ resolve, reject, timer });
    });
  };

  return {
    get ready() {
      return isReady;
    },
    get config() {
      return config;
    },
    get paused() {
      return paused;
    },
    get pauseUntilMs() {
      return pauseUntilMs;
    },
    getConfig,
    applyConfig,
    /** @param {boolean} value @param {number} [untilMs] */
    setPaused(value, untilMs) {
      paused = Boolean(value);
      if (untilMs !== undefined) pauseUntilMs = untilMs;
      options.onReport?.('PAUSE_STATUS', { paused, untilMs: pauseUntilMs });
      return paused;
    },
    /** @param {string} event @param {Record<string, any>} [payload] */
    report(event, payload = {}) {
      if (
        event === 'BLOCKED' ||
        event === 'WARNING' ||
        event === 'TRANSFORM_SUMMARY' ||
        event === 'PATCH_STATUS'
      )
        options.onReport?.(event, payload);
    },
    /** @param {any} error */
    reportError(error) {
      options.onReport?.('ERROR', {
        code: typeof error?.code === 'string' ? error.code : 'E_TRANSFORM_FAIL',
      });
    },
  };
}

export { DEFAULT_CONFIG };
