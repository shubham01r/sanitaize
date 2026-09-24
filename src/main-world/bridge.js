/**
 * @param {Object} options
 * @param {any} options.windowObject
 * @param {() => any|Promise<any>} [options.getConfig]
 * @param {(payload:any) => any} [options.onHello]
 * @param {(adapterId:string) => void} [options.onReady]
 * @param {(type:string,payload:any) => void} [options.onMessage]
 */
export function createContentBridge(options) {
  const { windowObject } = options;
  if (!windowObject || typeof windowObject.addEventListener !== 'function')
    throw new TypeError('A window-like object is required.');
  const addEventListener = windowObject.addEventListener.bind(windowObject);
  const removeEventListener = windowObject.removeEventListener?.bind(windowObject);
  const postMessage = windowObject.postMessage?.bind(windowObject);
  if (typeof postMessage !== 'function') throw new TypeError('postMessage is required.');
  const nextId = createIdFactory(windowObject.crypto);
  const targetOrigin = windowObject.location?.origin || '*';
  /** @type {string|null} */
  let channel = null;
  let started = false;
  let stopped = false;
  let configRequested = false;

  /** @param {string} type @param {any} payload @param {'to-main'|'to-content'} [dir] */
  const send = (type, payload = {}, dir = 'to-main') => {
    if (stopped) return;
    postMessage(
      { source: SOURCE, v: VERSION, channel, dir, type, id: nextId(), payload },
      targetOrigin,
    );
  };

  /** @param {any} event */
  const onMessage = async (event) => {
    if (stopped || event?.source !== windowObject) return;
    const data = event.data;
    if (!validEnvelope(data) || data.dir !== 'to-content') return;
    if (data.type === 'HELLO') {
      const payload = data.payload;
      if (!payload || typeof payload.channel !== 'string') return;
      if (channel && channel !== payload.channel) return;
      channel = payload.channel;
      options.onHello?.(payload);
      if (!configRequested && typeof options.getConfig === 'function') {
        configRequested = true;
        try {
          const config = await options.getConfig();
          if (config) send('CONFIG_PUSH', { config });
        } catch {
          // Main-world timeout remains the fail-closed fallback.
        }
      }
      return;
    }
    if (channel && data.channel !== channel) return;
    if (data.type === 'READY') options.onReady?.(data.payload?.adapterId);
    else options.onMessage?.(data.type, data.payload);
  };

  const start = () => {
    if (started || stopped) return;
    started = true;
    addEventListener('message', onMessage);
    send('HELLO_REQUEST');
  };
  return {
    start,
    stop() {
      stopped = true;
      removeEventListener?.('message', onMessage);
    },
    send,
  };
}

export { SOURCE, VERSION };

const SOURCE = 'sanitaize';
const VERSION = 1;

/** @param {any} value */
function isObject(value) {
  return value !== null && typeof value === 'object';
}

/** @param {any} data */
function validEnvelope(data) {
  return (
    isObject(data) &&
    data.source === SOURCE &&
    data.v === VERSION &&
    typeof data.type === 'string' &&
    (data.dir === 'to-main' || data.dir === 'to-content')
  );
}

/** @param {any} cryptoObject */
function createIdFactory(cryptoObject) {
  const randomUUID = cryptoObject?.randomUUID;
  let fallback = 0;
  return () => {
    if (typeof randomUUID === 'function') return randomUUID.call(cryptoObject);
    fallback += 1;
    return `00000000-0000-4000-8000-${String(fallback).padStart(12, '0')}`;
  };
}

/**
 * @param {Object} options
 * @param {any} options.windowObject
 * @param {string} options.channel
 * @param {string} options.adapterId
 * @param {any} [options.cryptoObject]
 * @param {(config:any) => any} [options.onConfig]
 * @param {(type:string,payload:any)=>void} [options.onWarning]
 * @param {(payload:any)=>void} [options.onIgnore]
 * @param {()=>void} [options.onClearVault]
 * @param {(payload:any)=>void} [options.onPause]
 */
export function createMainBridge(options) {
  const { windowObject, channel, adapterId } = options;
  if (!windowObject || typeof windowObject.addEventListener !== 'function')
    throw new TypeError('A window-like object is required.');
  if (typeof channel !== 'string' || channel.length === 0)
    throw new TypeError('A non-empty bridge channel is required.');

  const nextId = createIdFactory(options.cryptoObject ?? windowObject.crypto);
  const addEventListener = windowObject.addEventListener.bind(windowObject);
  const removeEventListener = windowObject.removeEventListener?.bind(windowObject);
  const postMessage = windowObject.postMessage?.bind(windowObject);
  if (typeof postMessage !== 'function') throw new TypeError('postMessage is required.');
  const targetOrigin = windowObject.location?.origin || '*';
  let stopped = false;

  /** @param {string} type @param {any} payload @param {'to-main'|'to-content'} [dir] @param {string|null} [messageChannel] */
  const send = (type, payload = {}, dir = 'to-content', messageChannel = channel) => {
    if (stopped) return;
    postMessage(
      { source: SOURCE, v: VERSION, channel: messageChannel, dir, type, id: nextId(), payload },
      targetOrigin,
    );
  };

  /** @param {any} event */
  const onMessage = (event) => {
    if (stopped || event?.source !== windowObject) return;
    const data = event.data;
    if (!validEnvelope(data)) return;
    if (data.type === 'HELLO_REQUEST') {
      if (data.dir !== 'to-main') return;
      send('HELLO', { channel, version: VERSION, adapterId });
      return;
    }
    if (data.dir !== 'to-main' || data.channel !== channel) return;
    if (data.type === 'IGNORE_ADD') {
      if (typeof data.payload?.type === 'string' && typeof data.payload?.valueHash === 'string')
        options.onIgnore?.(data.payload);
      return;
    }
    if (data.type === 'VAULT_CLEAR') {
      options.onClearVault?.();
      return;
    }
    if (data.type === 'PAUSE_SET') {
      options.onPause?.(data.payload ?? {});
      return;
    }
    if (data.type !== 'CONFIG_PUSH') return;
    const config = data.payload?.config;
    if (!config || typeof config !== 'object') return;
    try {
      const result = options.onConfig?.(config);
      if (result && typeof result.then === 'function') {
        result
          .then(() => send('READY', { adapterId }))
          .catch(() => options.onWarning?.('WARNING', { code: 'E_TRANSFORM_FAIL' }));
      } else send('READY', { adapterId });
    } catch {
      options.onWarning?.('WARNING', { code: 'E_TRANSFORM_FAIL' });
    }
  };

  addEventListener('message', onMessage);
  send('HELLO', { channel, version: VERSION, adapterId });
  return {
    channel,
    send,
    stop() {
      if (stopped) return;
      stopped = true;
      removeEventListener?.('message', onMessage);
    },
  };
}
