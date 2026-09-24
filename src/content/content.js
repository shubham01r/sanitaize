import { log } from '../shared/log.js';
import { createContentBridge } from '../main-world/bridge.js';
import { createOverlayHost } from './bridge.js';
import { createInputWatcher } from './input-watcher.js';
import { createGhostBadge } from './ghost-badge.js';
import { createBadgePopover } from './badge-popover.js';
import { createToast } from './toast.js';
import { DEFAULT_CONFIG } from '../core/types.js';

/**
 * @param {any} runtimeApi
 * @param {any} message
 * @returns {Promise<any>}
 */
function sendRuntimeMessage(runtimeApi, message) {
  if (typeof runtimeApi?.sendMessage !== 'function')
    return Promise.reject(new Error('Extension messaging is unavailable.'));
  return Promise.resolve(runtimeApi.sendMessage(message));
}

/** @param {any} payload */
function countValues(payload) {
  const counts = payload?.counts;
  if (!counts || typeof counts !== 'object') return 0;
  return Object.values(counts).reduce(
    (total, value) => total + (Number.isFinite(value) ? value : 0),
    0,
  );
}

/** @param {any} payload */
function safeCounts(payload) {
  const counts = payload?.counts;
  if (!counts || typeof counts !== 'object') return {};
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, value]) => Number.isFinite(value))
      .map(([type, value]) => [type, Math.max(0, Math.trunc(value))]),
  );
}

/** @param {any} windowObject */
function localConfigDelayMs(windowObject) {
  const hostname = windowObject?.location?.hostname;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]') return 0;
  const raw = new URLSearchParams(windowObject?.location?.search ?? '').get('szConfigDelayMs');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10_000) : 0;
}

/**
 * @param {Object} options
 * @param {any} options.windowObject
 * @param {any} options.documentObject
 * @param {any} [options.runtimeApi]
 */
export function startContent({ windowObject, documentObject, runtimeApi }) {
  const globalRuntime = /** @type {{chrome?: {runtime?: any}}} */ (globalThis);
  const messaging = runtimeApi ?? globalRuntime.chrome?.runtime;
  const root = documentObject?.documentElement;
  if (root) root.dataset.szIso = 'ready';

  let config = DEFAULT_CONFIG;
  let adapterId = 'chatgpt';
  let detections = [];
  let lastItems = [];
  let lastState = 'ready';
  let composer = null;
  let composerFound = false;
  let replacedTotal = 0;
  const replacedByType = {};
  const replacementHashes = new Set();
  let lastMessage = null;
  const ui = createOverlayHost(documentObject);
  const toast = createToast(ui.layer);
  /** @type {any} */
  let bridge;
  const popover = createBadgePopover({
    root: ui.layer,
    onIgnore: (payload) => bridge.send('IGNORE_ADD', payload),
    onVerify: () => toast.showInfo('Open Chrome DevTools → Network and inspect the outbound request payload.'),
  });
  const badge = createGhostBadge({
    root: ui.layer,
    composer: null,
    onOpen: (state, details) => {
      if (state === 'off' || state === 'paused') return;
      popover.toggle(details.detections ?? detections, lastItems, badge.element);
    },
    onState: (state) => {
      lastState = state;
      if (root) root.dataset.szState = state;
      if (state === 'detected' || state === 'protected' || state === 'blocked')
        ui.announce(badge.element.textContent ?? '', state === 'blocked');
    },
  });
  const watcher = createInputWatcher({
    documentObject,
    selectors: ['#prompt-textarea', 'textarea', '[contenteditable="true"]'],
    config,
    onChange(state) {
      composer = state.composer ?? null;
      composerFound = state.found;
      badge.setComposer(composer);
      detections = state.detections;
      badge.setDetections(detections);
      if (!state.found) {
        badge.setState('hidden');
        return;
      }
      if (state.error === 'E_INPUT_TOO_LARGE') {
        badge.setState('blocked');
        toast.showBlocked('E_INPUT_TOO_LARGE');
        return;
      }
      if (config.enabled === false) badge.setState('off');
      else if (config.paused) badge.setState('paused');
      else if (lastState !== 'blocked' && lastState !== 'protected') badge.setState(detections.length ? 'detected' : 'ready');
    },
  });

  bridge = createContentBridge({
    windowObject,
    async getConfig() {
      const delayMs = localConfigDelayMs(windowObject);
      if (delayMs > 0) {
        await new Promise((resolve) => (windowObject.setTimeout ?? setTimeout)(resolve, delayMs));
      }
      const response = await sendRuntimeMessage(messaging, { type: 'GET_EFFECTIVE_CONFIG' });
      if (!response?.ok || !response.config)
        throw new Error('Effective configuration is unavailable.');
      config = response.config;
      watcher.setConfig(config);
      return response.config;
    },
    onHello(payload) {
      adapterId = payload?.adapterId === 'claude' ? 'claude' : 'chatgpt';
      if (root) root.dataset.szAdapter = adapterId;
    },
    onReady(adapterIdFromMain) {
      if (adapterIdFromMain) adapterId = adapterIdFromMain;
      if (root) {
        root.dataset.szReady = 'ready';
        root.dataset.szState = composerFound ? (detections.length ? 'detected' : 'ready') : 'hidden';
      }
      if (composerFound) badge.setState(detections.length ? 'detected' : 'ready');
      log('content.config-ready', { adapterId });
    },
    onMessage(type, payload) {
      if (type === 'TRANSFORM_SUMMARY') {
        const counts = safeCounts(payload);
        const count = countValues({ counts });
        replacedTotal += count;
        for (const [type, amount] of Object.entries(counts))
          replacedByType[type] = (replacedByType[type] ?? 0) + amount;
        for (const item of Array.isArray(payload?.items) ? payload.items : [])
          if (typeof item?.valueHash === 'string') replacementHashes.add(item.valueHash);
        lastMessage = { count, latencyMs: Number(payload?.latencyMs) || 0, ts: Date.now() };
        lastItems = Array.isArray(payload?.items) ? payload.items : [];
        badge.setState('protected', { count });
        if (count > 0) toast.showSuccess(count, () => popover.open(detections, lastItems, badge.element));
        void sendRuntimeMessage(messaging, { type: 'SET_ACTION_BADGE', count });
        void sendRuntimeMessage(messaging, {
          type: 'AUDIT_APPEND',
          entry: {
            action: 'transform',
            counts,
            latencyMs: Number.isFinite(payload?.latencyMs) ? payload.latencyMs : 0,
          },
        });
      } else if (type === 'BLOCKED') {
        const code = typeof payload?.code === 'string' ? payload.code : 'E_TRANSFORM_FAIL';
        badge.setState('blocked');
        toast.showBlocked(code);
        void sendRuntimeMessage(messaging, {
          type: 'AUDIT_APPEND',
          entry: { action: 'block', code },
        });
      } else if (type === 'WARNING') {
        const code = typeof payload?.code === 'string' ? payload.code : 'W_UNKNOWN';
        if (code === 'W_ADAPTER_UNKNOWN_SHAPE') toast.showWarning(code);
        else if (code === 'W_PATCH_LOST') badge.setState('not-protecting');
        void sendRuntimeMessage(messaging, {
          type: 'AUDIT_APPEND',
          entry: { action: 'warning', code },
        });
      } else if (type === 'PATCH_STATUS') {
        if (root && (payload?.state === 'ok' || payload?.state === 'lost'))
          root.dataset.szPatchState = payload.state;
        if (payload?.state === 'lost') badge.setState('not-protecting');
      } else if (type === 'PAUSE_STATUS') {
        config = { ...config, paused: Boolean(payload?.paused) };
        badge.setState(config.paused ? 'paused' : detections.length ? 'detected' : 'ready');
      } else if (type === 'VAULT_STATS' && payload?.ignored) {
        const ignoreHashes = new Set(config.ignoreHashes ?? []);
        if (typeof payload.valueHash === 'string') ignoreHashes.add(payload.valueHash);
        config = { ...config, ignoreHashes: [...ignoreHashes] };
        watcher.setConfig(config);
        toast.showInfo('This sensitive value will be ignored in this tab.');
      }
    },
  });
  const onRuntimeMessage = (message, _sender, sendResponse) => {
    if (message?.type === 'GET_TAB_STATE') {
      const site = windowObject.location?.hostname ?? 'unknown';
      sendResponse?.({
        ok: true,
        state: {
          site,
          adapterId,
          active: config.enabled !== false && config.sites?.[adapterId] !== false,
          paused: Boolean(config.paused),
          stats: { replaced: replacedTotal, byType: { ...replacedByType } },
          vaultSize: replacementHashes.size,
          last: lastMessage,
          patch: root?.dataset?.szPatchState === 'lost' ? 'lost' : 'ok',
        },
      });
      return false;
    }
    if (message?.type === 'CLEAR_VAULT') {
      replacementHashes.clear();
      replacedTotal = 0;
      for (const key of Object.keys(replacedByType)) delete replacedByType[key];
      lastMessage = null;
      lastItems = [];
      bridge.send('VAULT_CLEAR');
      sendResponse?.({ ok: true });
      return false;
    }
    if (message?.type === 'SET_SITE_ENABLED') {
      const enabled = Boolean(message.enabled);
      config = {
        ...config,
        enabled,
        sites: { ...(config.sites ?? {}), [adapterId]: enabled },
      };
      badge.setState(enabled ? (detections.length ? 'detected' : 'ready') : 'off');
      bridge.send('CONFIG_PUSH', { config });
      sendResponse?.({ ok: true, enabled });
      return false;
    }
    if (message?.type === 'PAUSE_TAB') {
      const duration = Number.isFinite(message.ms) ? Math.max(0, Number(message.ms)) : 0;
      const paused = duration > 0;
      config = { ...config, paused };
      badge.setState(paused ? 'paused' : detections.length ? 'detected' : 'ready');
      bridge.send('PAUSE_SET', { paused, untilMs: paused ? Date.now() + duration : undefined });
      sendResponse?.({ ok: true, paused });
      return false;
    }
    return false;
  };
  messaging?.onMessage?.addListener?.(onRuntimeMessage);
  bridge.start();
  log('content.ready', { world: 'isolated' });
  return {
    bridge,
    get state() {
      return { replaced: replacedTotal, byType: { ...replacedByType } };
    },
    stop() {
      messaging?.onMessage?.removeListener?.(onRuntimeMessage);
      watcher.stop();
      badge.stop();
      popover.close();
      ui.destroy();
      bridge.stop();
    },
  };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const globalRuntime = /** @type {{chrome?: {runtime?: any}}} */ (globalThis);
  startContent({
    windowObject: window,
    documentObject: document,
    runtimeApi: globalRuntime.chrome?.runtime,
  });
}
