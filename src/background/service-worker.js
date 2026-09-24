import { registerServiceWorker } from './config.js';

export { registerServiceWorker };

registerServiceWorker();
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('install', () => {});
  globalThis.addEventListener('activate', () => {});
}
