import { OVERLAY_STYLES } from './styles.css.js';

/**
 * Create the isolated-world overlay host. The shadow root is intentionally
 * closed; all overlay markup and styles stay inside it.
 * @param {any} documentObject
 */
export function createOverlayHost(documentObject) {
  const host = documentObject.createElement('div');
  host.setAttribute('data-sanitaize-ui', 'host');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = documentObject.createElement('style');
  style.textContent = OVERLAY_STYLES;
  const layer = documentObject.createElement('div');
  layer.className = 'sz-layer';
  const liveRegion = documentObject.createElement('div');
  liveRegion.className = 'sz-visually-hidden';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  layer.append(liveRegion);
  shadow.append(style, layer);
  if (documentObject.body) documentObject.body.append(host);
  else documentObject.addEventListener?.('DOMContentLoaded', () => documentObject.body?.append(host), {
    once: true,
  });
  return {
    host,
    shadow,
    layer,
    liveRegion,
    announce(message, assertive = false) {
      liveRegion.textContent = message;
      liveRegion.setAttribute('role', assertive ? 'alert' : 'status');
    },
    destroy() {
      host.remove();
    },
  };
}

/** @param {any} root @param {string} tag @param {string} className @param {string} [text] */
export function element(root, tag, className, text) {
  const node = root.ownerDocument.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
