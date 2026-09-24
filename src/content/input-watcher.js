import { detect } from '../core/detect.js';
import { DEFAULT_CONFIG, LIMITS } from '../core/types.js';

/** @param {any} element */
function readText(element) {
  return element?.value ?? element?.innerText ?? element?.textContent ?? '';
}

/**
 * Watch a supported composer without changing its text.
 * @param {Object} options
 * @param {any} options.documentObject
 * @param {string[]} options.selectors
 * @param {(state:{found:boolean,text:string,detections:any[],composer?:any,error?:string})=>void} options.onChange
 * @param {any} [options.config]
 */
export function createInputWatcher(options) {
  const { documentObject, selectors, onChange } = options;
  let config = options.config ?? DEFAULT_CONFIG;
  let composer = null;
  let timer = null;
  let observer = null;
  let stopped = false;

  const findComposer = () => {
    for (const selector of selectors) {
      const candidate = documentObject.querySelector(selector);
      if (candidate) return candidate;
    }
    return null;
  };

  const scan = () => {
    if (stopped) return;
    composer = findComposer();
    if (!composer) {
      onChange({ found: false, text: '', detections: [] });
      return;
    }
    const text = readText(composer);
    if (text.length > LIMITS.MAX_SCAN_CHARS) {
      onChange({ found: true, text, detections: [], composer, error: 'E_INPUT_TOO_LARGE' });
      return;
    }
    onChange({ found: true, text, detections: detect(text, config), composer });
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(scan, LIMITS.DEBOUNCE_MS);
  };

  const onInput = (event) => {
    const target = event?.target;
    if (!target || target === composer || composer?.contains?.(target)) schedule();
  };

  const attach = () => {
    if (stopped) return;
    const next = findComposer();
    if (next === composer) return;
    if (composer?.removeEventListener) composer.removeEventListener('input', onInput, true);
    composer = next;
    if (composer) composer.addEventListener('input', onInput, { passive: true });
    scan();
  };

  documentObject.addEventListener?.('input', onInput, true);
  const observerClass = documentObject.defaultView?.MutationObserver;
  if (observerClass) {
    observer = new observerClass(attach);
    observer.observe(documentObject.documentElement ?? documentObject, {
      childList: true,
      subtree: true,
    });
  }
  attach();

  return {
    refresh: scan,
    setConfig(next) {
      config = next ?? DEFAULT_CONFIG;
      scan();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      observer?.disconnect();
      documentObject.removeEventListener?.('input', onInput, true);
      if (composer?.removeEventListener) composer.removeEventListener('input', onInput);
    },
  };
}
