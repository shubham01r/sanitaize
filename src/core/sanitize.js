import { detect } from './detect.js';
import { createSanitaizeError } from './errors.js';
import { generateMock } from './generators/index.js';
import { hashValue } from './hash.js';
import { createRandomSource } from './random.js';
import { DEFAULT_CONFIG } from './types.js';
import { Vault } from './vault.js';

const NON_TEXT_KEY = /^(?:id|.*_id|model|role|type|timezone|locale|version|action|status)$/i;

/** @param {any} ctx */
function ensureContext(ctx = {}) {
  return {
    vault: ctx.vault ?? new Vault(),
    rand: ctx.rand ?? createRandomSource(),
    config: ctx.config ?? DEFAULT_CONFIG,
    sourceText: ctx.sourceText ?? '',
  };
}

/** @param {string} serialized @param {string[]} realValues */
export function assertNoLeak(serialized, realValues) {
  for (const value of realValues) {
    const escaped = JSON.stringify(value).slice(1, -1);
    if (serialized.includes(value) || serialized.includes(escaped))
      throw createSanitaizeError('E_LEAK_ASSERT');
  }
}

/** @param {string} text @param {any} context */
export function sanitizeText(text, context = {}) {
  const ctx = ensureContext(context);
  ctx.sourceText = text;
  const started = Date.now();
  const detections = detect(text, ctx.config).filter((item) => !ctx.vault.hasMock(item.value));
  let result = text;
  const replacements = [];
  /** @type {Record<string, number>} */
  const counts = {};
  for (const detection of [...detections].sort((left, right) => right.start - left.start)) {
    const mock = ctx.vault.getOrCreate(detection, () => generateMock(detection, ctx));
    result = `${result.slice(0, detection.start)}${mock}${result.slice(detection.end)}`;
    replacements.push({
      type: detection.type,
      ruleId: detection.ruleId,
      mock,
      valueHash: hashValue(detection.type, detection.value),
    });
    counts[detection.type] = (counts[detection.type] ?? 0) + 1;
  }
  return { text: result, replacements, counts, latencyMs: Date.now() - started };
}

/** @param {any} value @param {string} key */
function isSkippedKey(value, key) {
  return typeof value === 'string' && NON_TEXT_KEY.test(key);
}

/** @param {any} node @param {string} key @param {(next:any) => void} setNode @param {any[]} slots */
function collectFallbackSlots(node, key, setNode, slots) {
  if (typeof node === 'string') {
    if (!NON_TEXT_KEY.test(key)) slots.push({ get: () => node, set: setNode });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      collectFallbackSlots(item, String(index), (next) => (node[index] = next), slots),
    );
    return;
  }
  if (node && typeof node === 'object') {
    for (const [childKey, childValue] of Object.entries(node)) {
      collectFallbackSlots(childValue, childKey, (next) => (node[childKey] = next), slots);
    }
  }
}

/** @param {any} json @param {any} adapter @param {any} context */
export function sanitizeJsonBody(json, adapter, context = {}) {
  const ctx = ensureContext(context);
  const warnings = [];
  if (typeof json === 'string') {
    const started = Date.now();
    const realValues = detect(json, ctx.config).map((item) => item.value);
    const sanitized = sanitizeText(json, ctx);
    assertNoLeak(JSON.stringify(sanitized.text), realValues);
    return {
      json: sanitized.text,
      replacements: sanitized.replacements,
      counts: sanitized.counts,
      latencyMs: Date.now() - started,
      warnings: ['W_ADAPTER_UNKNOWN_SHAPE'],
    };
  }
  let slots = adapter?.getRequestSlots?.(json) ?? [];
  if (slots.length === 0) {
    warnings.push('W_ADAPTER_UNKNOWN_SHAPE');
    slots = [];
    collectFallbackSlots(json, '', () => {}, slots);
  }
  const replacements = [];
  /** @type {Record<string, number>} */
  const counts = {};
  const realValues = [];
  const started = Date.now();
  for (const slot of slots) {
    const original = slot.get();
    if (typeof original !== 'string') continue;
    realValues.push(...detect(original, ctx.config).map((item) => item.value));
    const sanitized = sanitizeText(original, { ...ctx, sourceText: original });
    slot.set(sanitized.text);
    replacements.push(...sanitized.replacements);
    for (const [type, count] of Object.entries(sanitized.counts))
      counts[type] = (counts[type] ?? 0) + count;
    const remaining = detect(sanitized.text, ctx.config).filter(
      (item) => !ctx.vault.hasMock(item.value),
    );
    if (remaining.length > 0) {
      const second = sanitizeText(sanitized.text, { ...ctx, sourceText: sanitized.text });
      slot.set(second.text);
      replacements.push(...second.replacements);
      for (const [type, count] of Object.entries(second.counts))
        counts[type] = (counts[type] ?? 0) + count;
    }
  }
  const serialized = JSON.stringify(json);
  assertNoLeak(serialized, realValues);
  return { json, replacements, counts, latencyMs: Date.now() - started, warnings };
}
