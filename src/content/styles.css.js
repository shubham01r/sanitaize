export const OVERLAY_STYLES = `
:host {
  all: initial;
  color-scheme: dark;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
}
*, *::before, *::after { box-sizing: border-box; }
.sz-layer {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
  color: #E6EDF7;
  font: inherit;
}
.sz-badge {
  position: fixed;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  max-width: min(390px, calc(100vw - 24px));
  padding: 5px 10px 5px 9px;
  border: 1px solid rgba(34, 211, 238, .35);
  border-radius: 999px 999px 999px 8px;
  background: rgba(11, 18, 32, .96);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
  color: #E6EDF7;
  cursor: pointer;
  pointer-events: auto;
  white-space: nowrap;
  transition: opacity 120ms ease, transform 120ms ease, border-color 120ms ease;
}
.sz-badge:hover { border-color: #22D3EE; }
.sz-badge:focus-visible, .sz-popover button:focus-visible, .sz-toast button:focus-visible {
  outline: 2px solid #A5B4FC;
  outline-offset: 2px;
}
.sz-badge[hidden], .sz-popover[hidden], .sz-toast[hidden] {
  display: none !important;
}
.sz-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: #2DD4BF;
  box-shadow: 0 0 0 3px rgba(45, 212, 191, .12);
}
.sz-badge[data-state="detected"] { border-color: rgba(245, 185, 75, .7); }
.sz-badge[data-state="detected"] .sz-dot { background: #F5B94B; box-shadow: 0 0 0 3px rgba(245, 185, 75, .12); }
.sz-badge[data-state="protecting"] .sz-dot { background: #22D3EE; animation: sz-pulse 1s ease-in-out infinite; }
.sz-badge[data-state="protected"] { border-color: rgba(52, 211, 153, .7); }
.sz-badge[data-state="protected"] .sz-dot { background: #34D399; }
.sz-badge[data-state="blocked"], .sz-badge[data-state="not-protecting"] { border-color: rgba(251, 113, 133, .8); }
.sz-badge[data-state="blocked"] .sz-dot, .sz-badge[data-state="not-protecting"] .sz-dot { background: #FB7185; }
.sz-badge[data-state="paused"] { border-color: rgba(245, 185, 75, .8); }
.sz-badge[data-state="paused"] .sz-dot { background: #F5B94B; }
.sz-badge[data-state="off"] { opacity: .78; }
.sz-badge[data-state="off"] .sz-dot { background: #94A3B8; box-shadow: none; }
.sz-label { overflow: hidden; text-overflow: ellipsis; }
.sz-chips { display: inline-flex; gap: 4px; min-width: 0; }
.sz-chip, .sz-type {
  display: inline-flex;
  align-items: center;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(148, 163, 184, .24);
  border-radius: 999px;
  padding: 2px 6px;
  color: #94A3B8;
  font-size: 11px;
}
.sz-sweep { position: absolute; inset: 0 auto 0 0; width: 2px; background: #22D3EE; opacity: 0; pointer-events: none; }
.sz-badge.is-swapping .sz-label { animation: sz-fade 160ms ease; }
.sz-badge.is-swapping .sz-sweep { animation: sz-sweep 280ms ease-out; }
.sz-popover {
  position: fixed;
  width: min(320px, calc(100vw - 24px));
  max-height: min(360px, calc(100vh - 24px));
  overflow: auto;
  padding: 14px;
  border: 1px solid rgba(34, 211, 238, .35);
  border-radius: 10px;
  background: #0B1220;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
  pointer-events: auto;
  animation: sz-pop-in 120ms ease-out;
}
.sz-popover h2 { margin: 0 0 10px; color: #E6EDF7; font-size: 15px; font-weight: 600; }
.sz-popover hr { border: 0; border-top: 1px solid rgba(148, 163, 184, .18); margin: 10px 0; }
.sz-row { display: grid; grid-template-columns: 92px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 7px 0; }
.sz-row + .sz-row { border-top: 1px solid rgba(148, 163, 184, .1); }
.sz-row.is-ignored { opacity: .55; }
.sz-row-type, .sz-row-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sz-row-type { color: #94A3B8; }
.sz-row-preview { color: #E6EDF7; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 12px; }
.sz-button {
  border: 1px solid rgba(34, 211, 238, .35);
  border-radius: 6px;
  padding: 4px 7px;
  background: #111B2E;
  color: #E6EDF7;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.sz-button:hover { border-color: #22D3EE; }
.sz-button[data-variant="quiet"] { border-color: transparent; background: transparent; color: #A5B4FC; }
.sz-popover-footer { margin: 0; color: #94A3B8; font-size: 12px; }
.sz-toast {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px 12px;
  width: min(360px, calc(100vw - 32px));
  padding: 12px;
  border: 1px solid rgba(34, 211, 238, .35);
  border-radius: 10px;
  background: #0B1220;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
  pointer-events: auto;
  animation: sz-toast-in 160ms ease-out;
}
.sz-toast[data-kind="blocked"] { border-color: rgba(251, 113, 133, .7); }
.sz-toast-message { color: #E6EDF7; }
.sz-toast-code { color: #94A3B8; font-size: 11px; }
.sz-toast-actions { display: flex; gap: 6px; align-items: center; }
.sz-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@keyframes sz-pulse { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes sz-fade { from { opacity: .25; } to { opacity: 1; } }
@keyframes sz-sweep { from { transform: translateX(0); opacity: .9; } to { transform: translateX(390px); opacity: 0; } }
@keyframes sz-pop-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
@keyframes sz-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0ms !important; transition-duration: 0ms !important; }
}
`;
