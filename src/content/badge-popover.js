import { element } from './bridge.js';
import { hashValue } from '../core/hash.js';
import { labelForType, maskDetection } from './copy.js';

/**
 * @param {Object} options
 * @param {any} options.root
 * @param {(payload:{type:string,valueHash:string})=>void} options.onIgnore
 * @param {()=>void} [options.onVerify]
 */
export function createBadgePopover(options) {
  const { root, onIgnore, onVerify } = options;
  const panel = element(root, 'section', 'sz-popover');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'What SanitAIze will replace');
  const heading = element(root, 'h2', '', 'What SanitAIze will replace');
  const close = element(root, 'button', 'sz-button', 'Close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close details');
  const list = element(root, 'div', 'sz-list');
  const footer = element(root, 'p', 'sz-popover-footer', 'Your text stays as you typed it. Only the copy sent to the AI is changed.');
  const verify = element(root, 'button', 'sz-button', 'How to verify');
  verify.type = 'button';
  verify.dataset.variant = 'quiet';
  panel.append(heading, close, list, footer, verify);
  root.append(panel);
  let lastFocus = null;
  let ignored = new Set();

  const closePanel = () => {
    panel.hidden = true;
    if (lastFocus?.focus) lastFocus.focus();
  };

  const render = (detections = [], items = []) => {
    list.replaceChildren();
    const byHash = new Map(items.filter((item) => item?.valueHash).map((item) => [item.valueHash, item]));
    for (const detection of detections) {
      const valueHash = detection.valueHash ?? hashValue(detection.type, detection.value);
      const item = byHash.get(valueHash);
      const row = element(root, 'div', 'sz-row');
      if (ignored.has(valueHash)) row.classList.add('is-ignored');
      row.append(element(root, 'span', 'sz-row-type', labelForType(detection.type)));
      const preview = item?.mock
        ? `${maskDetection(detection.type, detection.value)} → ${item.mock}`
        : maskDetection(detection.type, detection.value);
      row.append(element(root, 'span', 'sz-row-preview', preview));
      const ignore = element(root, 'button', 'sz-button', ignored.has(valueHash) ? 'Ignored in this tab' : 'Ignore');
      ignore.type = 'button';
      ignore.disabled = ignored.has(valueHash);
      ignore.addEventListener('click', () => {
        ignored.add(valueHash);
        onIgnore?.({ type: detection.type, valueHash });
        render(detections, items);
      });
      row.append(ignore);
      list.append(row);
    }
    if (detections.length === 0) list.append(element(root, 'p', 'sz-popover-footer', 'No sensitive values detected.'));
  };

  const place = (anchor) => {
    if (!anchor?.getBoundingClientRect) return;
    const rect = anchor.getBoundingClientRect();
    const view = root.ownerDocument?.defaultView ?? globalThis;
    panel.style.left = `${Math.max(8, Math.min(rect.left, (view.innerWidth || 1280) - 336))}px`;
    panel.style.top = `${Math.max(8, rect.bottom + 8)}px`;
  };

  close.addEventListener('click', closePanel);
  verify.addEventListener('click', () => onVerify?.());
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePanel();
    }
  });
  return {
    element: panel,
    open(detections, items, anchor) {
      lastFocus = root.ownerDocument?.activeElement ?? null;
      render(detections, items);
      place(anchor);
      panel.hidden = false;
      close.focus();
    },
    close: closePanel,
    toggle(detections, items, anchor) {
      if (panel.hidden) this.open(detections, items, anchor);
      else closePanel();
    },
    isOpen() {
      return !panel.hidden;
    },
    resetIgnored() {
      ignored = new Set();
    },
  };
}
