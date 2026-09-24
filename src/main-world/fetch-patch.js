/** @param {any} error */
function blockedError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'E_TRANSFORM_FAIL';
  const result = /** @type {TypeError & {code?: string}} */ (
    new TypeError(`SanitAIze blocked this request (${code})`)
  );
  result.code = code;
  return result;
}

function abortError() {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

/** @param {any} input @param {any} init */
function requestSignal(input, init) {
  return init?.signal ?? input?.signal ?? null;
}

/** @param {any} response @param {any} adapter @param {any} vault @param {any} builtIns @param {(code:string)=>void} [onWarning] */
export function wrapResponse(response, adapter, vault, builtIns = {}, onWarning) {
  if (!response?.body) return response;
  const contentType = response.headers?.get?.('content-type') ?? '';
  const HeadersClass = builtIns.Headers ?? Headers;
  const JSONClass = builtIns.JSON ?? JSON;
  const ResponseClass = builtIns.Response ?? Response;
  if (!contentType.includes('text/event-stream')) {
    const source = typeof response.clone === 'function' ? response.clone() : response;
    const headers = new HeadersClass(response.headers);
    return source.text().then((/** @type {string} */ text) => {
      let body = text;
      try {
        const json = JSONClass.parse(text);
        /** @param {any} value @returns {any} */
        const replace = (value) => {
          if (typeof value === 'string') return vault.rehydrateText(value);
          if (Array.isArray(value)) return value.map(replace);
          if (value && typeof value === 'object')
            return Object.fromEntries(
              Object.entries(value).map(([key, child]) => [key, replace(child)]),
            );
          return value;
        };
        body = JSON.stringify(replace(json));
      } catch {
        body = vault.rehydrateText(text);
      }
      const nextHeaders = new HeadersClass(headers);
      nextHeaders.delete('content-length');
      return new ResponseClass(body, {
        status: response.status,
        statusText: response.statusText,
        headers: nextHeaders,
      });
    });
  }

  const handler = adapter.createStreamHandler(vault);
  const Decoder = builtIns.TextDecoder ?? TextDecoder;
  const Encoder = builtIns.TextEncoder ?? TextEncoder;
  const TransformStreamClass = builtIns.TransformStream ?? TransformStream;
  const decoder = new Decoder();
  const encoder = new Encoder();
  const parser = new SseParser();
  const transform = new TransformStreamClass({
    transform(/** @type {any} */ chunk, /** @type {any} */ controller) {
      try {
        const text = decoder.decode(chunk, { stream: true });
        for (const event of parser.push(text))
          for (const output of handler.onEvent(event))
            controller.enqueue(encoder.encode(serializeSse(output)));
      } catch {
        onWarning?.('W_STREAM_PARSE');
        controller.enqueue(chunk);
      }
    },
    flush(/** @type {any} */ controller) {
      try {
        for (const event of parser.end())
          for (const output of handler.onEvent(event))
            controller.enqueue(encoder.encode(serializeSse(output)));
        for (const output of handler.onEnd())
          controller.enqueue(encoder.encode(serializeSse(output)));
      } catch {
        onWarning?.('W_STREAM_PARSE');
        // Inbound failures are deliberately fail-open.
      }
    },
  });
  const wrapped = new ResponseClass(response.body.pipeThrough(transform), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  for (const key of ['url', 'redirected', 'type']) {
    try {
      Object.defineProperty(wrapped, key, { value: response[key] });
    } catch {
      // Some test Response implementations expose non-configurable properties.
    }
  }
  return wrapped;
}

/**
 * @param {Object} options
 * @param {any} options.windowObject
 * @param {any} options.builtIns
 * @param {any} options.vault
 * @param {any} options.runtime
 * @param {{match:(input:any,init:any)=>any}} options.adapters
 * @param {any} [options.documentObject]
 * @param {(code:string)=>void} [options.onWarning]
 * @param {(payload:{state:'ok'|'lost'})=>void} [options.onStatus]
 */
export function installFetchPatch(options) {
  const { windowObject, builtIns, vault, runtime, adapters, documentObject } = options;
  /** @param {string} code */
  const emitWarning = (code) => {
    if (typeof options.onWarning === 'function') options.onWarning(code);
    else runtime.report?.('WARNING', { code });
  };
  /** @param {'ok'|'lost'} state */
  const emitStatus = (state) => {
    if (typeof options.onStatus === 'function') options.onStatus({ state });
    else runtime.report?.('PATCH_STATUS', { state });
  };
  const originalFetch = builtIns.fetch ?? windowObject.fetch;
  if (typeof originalFetch !== 'function')
    throw new TypeError('The original fetch is unavailable.');

  /** @param {any} input @param {any} init */
  const patched = function fetch(input, init) {
    const adapter = adapters.match(input, init);
    if (!adapter) return originalFetch.call(windowObject, input, init);
    return (async () => {
      const signal = requestSignal(input, init);
      if (signal?.aborted) throw abortError();
      let config;
      try {
        config = await runtime.getConfig(2000);
      } catch (error) {
        runtime.reportError(error);
        runtime.report('BLOCKED', {
          requestId: 'metadata-only',
          code:
            typeof (/** @type {any} */ (error)?.code) === 'string'
              ? /** @type {any} */ (error).code
              : 'E_CONFIG_TIMEOUT',
        });
        throw blockedError(error);
      }
      if (!config?.enabled || config?.sites?.[adapter.id] === false || runtime.paused)
        return originalFetch.call(windowObject, input, init);
      let next;
      try {
        const extracted = await extractBody(input, init, builtIns);
        let json;
        try {
          json = builtIns.JSON.parse(extracted.bodyText);
        } catch {
          throw createSanitaizeError('E_PARSE_BODY');
        }
        const result = sanitizeJsonBody(json, adapter, {
          vault,
          config,
          rand: builtIns.randomSource,
        });
        for (const warning of result.warnings) runtime.report('WARNING', { code: warning });
        next = extracted.rebuild(builtIns.JSON.stringify(result.json));
        runtime.report('TRANSFORM_SUMMARY', {
          requestId: 'metadata-only',
          counts: result.counts,
          latencyMs: result.latencyMs,
          items: result.replacements,
        });
      } catch (error) {
        runtime.reportError(error);
        runtime.report('BLOCKED', {
          requestId: 'metadata-only',
          code:
            typeof (/** @type {any} */ (error)?.code) === 'string'
              ? /** @type {any} */ (error).code
              : 'E_TRANSFORM_FAIL',
        });
        if (signal?.aborted) throw abortError();
        if (config?.failMode === 'open') return originalFetch.call(windowObject, input, init);
        throw blockedError(error);
      }
      if (signal?.aborted) throw abortError();
      const response = await originalFetch.call(windowObject, next.input, next.init);
      return adapter.matchResponse?.(response)
        ? wrapResponse(response, adapter, vault, builtIns, (code) => runtime.report('WARNING', { code }))
        : response;
    })();
  };

  Object.defineProperty(patched, 'toString', { value: () => 'function fetch() { [native code] }' });
  windowObject.fetch = patched;
  const reassert = () => {
    if (windowObject.fetch === patched) {
      emitStatus('ok');
      return true;
    }
    try {
      windowObject.fetch = patched;
      emitWarning('W_PATCH_REPLACED');
      emitStatus('ok');
      return true;
    } catch {
      emitWarning('W_PATCH_LOST');
      emitStatus('lost');
      return false;
    }
  };
  const onVisibilityChange = () => reassert();
  documentObject?.addEventListener?.('visibilitychange', onVisibilityChange);
  emitStatus('ok');
  return {
    patched,
    reassert,
    noteUnpatchedChannel() {
      emitWarning('W_UNPATCHED_CHANNEL');
    },
    state: () => (windowObject.fetch === patched ? 'ok' : 'lost'),
    restore() {
      documentObject?.removeEventListener?.('visibilitychange', onVisibilityChange);
      if (windowObject.fetch === patched) windowObject.fetch = originalFetch;
    },
  };
}

import { createSanitaizeError } from '../core/errors.js';
import { sanitizeJsonBody } from '../core/sanitize.js';
import { SseParser, serializeSse } from '../core/sse.js';

/** @param {any} headers */
function withoutContentLength(headers) {
  if (!headers) return headers;
  if (typeof headers.delete === 'function') {
    const copy = new headers.constructor(headers);
    copy.delete('content-length');
    return copy;
  }
  if (Array.isArray(headers))
    return headers.filter((entry) => String(entry[0]).toLowerCase() !== 'content-length');
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== 'content-length'),
  );
}

/** @param {any} input @param {any} builtIns */
function isRequest(input, builtIns) {
  if (builtIns.Request && input instanceof builtIns.Request) return true;
  return Boolean(input && typeof input.clone === 'function' && typeof input.text === 'function');
}

/** @param {any} value @param {any} builtIns */
function isBlob(value, builtIns) {
  return Boolean(builtIns.Blob && value instanceof builtIns.Blob);
}

/** @param {any} value */
function isArrayBuffer(value) {
  return (
    value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object ArrayBuffer]'
  );
}

/**
 * @param {any} input
 * @param {any} init
 * @param {any} builtIns
 * @returns {Promise<{bodyText:string,rebuild:(text:string)=>{input:any,init:any}}>}
 */
export async function extractBody(input, init = {}, builtIns = {}) {
  const Decoder = builtIns.TextDecoder ?? TextDecoder;
  const hasInitBody = init && Object.prototype.hasOwnProperty.call(init, 'body');
  let source;
  if (hasInitBody) source = init.body;
  else if (isRequest(input, builtIns)) source = input.clone();
  else source = null;

  let bodyText = '';
  if (source === null || source === undefined) {
    bodyText = '';
  } else if (typeof source === 'string') {
    bodyText = source;
  } else if (isRequest(source, builtIns)) {
    bodyText = await source.text();
  } else if (isBlob(source, builtIns)) {
    bodyText = await source.text();
  } else if (isArrayBuffer(source)) {
    bodyText = new Decoder().decode(new Uint8Array(source));
  } else {
    throw createSanitaizeError('E_UNSUPPORTED_BODY');
  }

  /** @param {string} text */
  const rebuild = (text) => {
    const nextInit = init ? { ...init } : {};
    nextInit.body = text;
    if (nextInit.headers !== undefined) nextInit.headers = withoutContentLength(nextInit.headers);
    if (isRequest(input, builtIns)) {
      const RequestClass = builtIns.Request;
      const requestInit = { ...nextInit };
      if (requestInit.headers === undefined) delete requestInit.headers;
      return { input: new RequestClass(input, requestInit), init: undefined };
    }
    return { input, init: nextInit };
  };
  return { bodyText, rebuild };
}
