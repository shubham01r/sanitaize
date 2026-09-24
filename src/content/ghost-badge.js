import { element } from './bridge.js';
import { labelForType } from './copy.js';

const STATES = {
  ready: 'SanitAIze ready',
  detected: 'sensitive values will be replaced',
  protecting: 'Replacing values…',
  protected: 'values replaced',
  blocked: 'Not sent',
  paused: 'Protection paused',
  off: 'SanitAIze off for this site',
  'not-protecting': 'Not protecting — reload this tab',
};

/**
 * @param {Object} options
 * @param {any} options.root
 * @param {any} options.composer
 * @param {(state:string, details:any)=>void} options.onOpen
 * @param {(state:string)=>void} options.onState
 */
export function createGhostBadge(options) {
  const { root, onOpen, onState } = options;
  let composer = options.composer;
  const badge = element(root, 'button', 'sz-badge');
  badge.type = 'button';
  badge.setAttribute('aria-haspopup', 'dialog');
  badge.setAttribute('aria-expanded', 'false');
  const dot = element(root, 'span', 'sz-dot');
  const label = element(root, 'span', 'sz-label');
  const chips = element(root, 'span', 'sz-chips');
  const sweep = element(root, 'span', 'sz-sweep');
  badge.append(dot, label, chips, sweep);
  root.append(badge);
  let state = 'ready';
  let raf = 0;
  let resizeObserver = null;
  let lastDetections = [];
  const view = root.ownerDocument?.defaultView ?? globalThis;

  const place = () => {
    raf = 0;
    if (!composer?.getBoundingClientRect) return;
    const rect = composer.getBoundingClientRect();
    const viewport = view;
    const width = viewport.innerWidth || 1280;
    const above = rect.top - 36;
    const inside = rect.top + 8;
    badge.style.left = `${Math.max(8, Math.min(rect.left + 12, width - 330))}px`;
    badge.style.top = `${Math.max(8, above >= 40 ? above : inside)}px`;
  };
  const schedulePlace = () => {
    if (raf) return;
    const request = view.requestAnimationFrame ?? ((callback) => setTimeout(callback, 16));
    raf = request(place);
  };

  const renderChips = (detections) => {
    chips.replaceChildren();
    const unique = [...new Map(detections.map((item) => [item.type, item])).values()];
    for (const item of unique.slice(0, 2)) {
      chips.append(element(root, 'span', 'sz-chip', labelForType(item.type)));
    }
    if (unique.length > 2) chips.append(element(root, 'span', 'sz-chip', `+${unique.length - 2}`));
  };

  const setState = (next, details = {}) => {
    state = next;
    badge.dataset.state = next;
    badge.hidden = next === 'hidden';
    const count = Number(details.count ?? lastDetections.length ?? 0);
    const labelText = next === 'detected' || next === 'protected'
      ? `${count} ${count === 1 ? (next === 'detected' ? 'sensitive value' : 'value') : next === 'detected' ? 'sensitive values' : 'values'} ${next === 'detected' ? 'will be replaced' : 'replaced'}`
      : STATES[next] ?? 'SanitAIze ready';
    label.textContent = labelText;
    if (next === 'detected') renderChips(details.detections ?? lastDetections);
    else chips.replaceChildren();
    if (next === 'blocked') badge.setAttribute('aria-live', 'assertive');
    else badge.setAttribute('aria-live', 'polite');
    if (next === 'protected') {
      badge.classList.remove('is-swapping');
      void badge.offsetWidth;
      badge.classList.add('is-swapping');
    }
    onState?.(next);
    schedulePlace();
  };

  badge.addEventListener('click', () => onOpen?.(state, { detections: lastDetections }));
  if (view.addEventListener) {
    view.addEventListener('resize', schedulePlace, { passive: true });
    view.addEventListener('scroll', schedulePlace, { passive: true });
    const ResizeObserverClass = view.ResizeObserver;
    if (ResizeObserverClass) {
      resizeObserver = new ResizeObserverClass(schedulePlace);
      if (composer) resizeObserver.observe(composer);
    }
  }
  setState('ready');
  return {
    element: badge,
    setState,
    setComposer(next) {
      if (next === composer) return;
      resizeObserver?.disconnect();
      composer = next;
      if (composer) resizeObserver?.observe(composer);
      schedulePlace();
    },
    setDetections(detections) {
      lastDetections = Array.isArray(detections) ? detections : [];
      if (state === 'ready' && lastDetections.length) setState('detected', { detections: lastDetections });
      else if (state === 'detected' && !lastDetections.length) setState('ready');
      else if (state === 'detected') setState('detected', { detections: lastDetections });
      else renderChips(lastDetections);
    },
    refresh: schedulePlace,
    stop() {
      const cancel = view.cancelAnimationFrame ?? clearTimeout;
      cancel(raf);
      resizeObserver?.disconnect();
      view.removeEventListener('resize', schedulePlace);
      view.removeEventListener('scroll', schedulePlace);
      badge.remove();
    },
  };
}
