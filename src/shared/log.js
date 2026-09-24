/**
 * Development-safe logger used by the Phase 0 bootstrap.
 * Real prompt values must never be passed to this function.
 *
 * @param {string} event
 * @param {Record<string, string | number | boolean>} [metadata]
 */
export function log(event, metadata = {}) {
  const runtime = /** @type {{ __SANITAIZE_DEV__?: boolean }} */ (globalThis);
  if (runtime.__SANITAIZE_DEV__ !== true) return;

  // Keep the logging surface metadata-only; callers must not pass values.
  console.info(`[SanitAIze] ${event}`, metadata);
}
