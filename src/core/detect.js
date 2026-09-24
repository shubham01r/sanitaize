import { hashValue } from './hash.js';
import { createSanitaizeError } from './errors.js';
import { RULES } from './rules/catalog.js';
import {
  isDatabaseUrl,
  isGenericSecret,
  isOpenAiShape,
  isSensitiveEmail,
  isSensitiveIpv4,
} from './rules/validators.js';
import { DEFAULT_CONFIG, LIMITS } from './types.js';

/** @type {Readonly<Record<string, number>>} */
const SENSITIVITY_RANK = Object.freeze({ relaxed: 0, balanced: 1, strict: 2 });

/** @param {string} name @param {Record<string, boolean>} config */
function isEnabled(name, config) {
  const detectors = /** @type {any} */ (config.detectors ?? DEFAULT_CONFIG.detectors);
  return detectors[name] !== false;
}

/** @param {string} sensitivity */
function meetsMinimumSensitivity(sensitivity) {
  const rank = SENSITIVITY_RANK[sensitivity] ?? SENSITIVITY_RANK.balanced;
  return rank >= SENSITIVITY_RANK.strict;
}

/** @param {string} value @param {string|undefined} validator @param {any} config */
function passesValidator(value, validator, config) {
  if (validator === 'dbUrl')
    return isDatabaseUrl(value, config.context ?? '', config.start ?? 0, config.sensitivity);
  if (validator === 'genericSecret') return isGenericSecret(value, config.sensitivity);
  if (validator === 'openaiShape') return isOpenAiShape(value);
  if (validator === 'email') return isSensitiveEmail(value, config.sensitivity);
  if (validator === 'ipv4') return isSensitiveIpv4(value, config.sensitivity);
  return true;
}

/** @param {string} text @param {any} config */
function dictionaryMatches(text, config) {
  const entries = Array.isArray(config.dictionary) ? config.dictionary : [];
  const results = [];
  for (const entry of entries) {
    if (entry.enabled === false) continue;
    const terms = [entry.term, ...(entry.aliases ?? [])].filter(Boolean);
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const flags = entry.caseSensitive ? 'gu' : 'giu';
      const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, flags);
      for (const match of text.matchAll(regex)) {
        const start = match.index ?? 0;
        results.push({
          id: `dictionary:${start}`,
          type: 'DICTIONARY',
          ruleId: 'dictionary',
          start,
          end: start + match[0].length,
          value: match[0],
          category: entry.category,
          confidence: 0.9,
          priority: 30,
        });
      }
    }
  }
  return results;
}

/** @param {any} left @param {any} right */
function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

/** @param {string} text @param {any} [config] */
export function detect(text, config = DEFAULT_CONFIG) {
  if (text.length > LIMITS.MAX_SCAN_CHARS) throw createSanitaizeError('E_INPUT_TOO_LARGE');
  const effective = {
    ...DEFAULT_CONFIG,
    ...config,
    detectors: { ...DEFAULT_CONFIG.detectors, ...(config.detectors ?? {}) },
  };
  const candidates = [];
  /** @type {Set<string>} */
  const ignoredHashes = new Set(effective.ignoreHashes ?? []);
  for (const rule of RULES) {
    if (!isEnabled(rule.enabledKey, effective)) continue;
    if (rule.minSensitivity && !meetsMinimumSensitivity(effective.sensitivity)) continue;
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    for (const match of text.matchAll(regex)) {
      const valueStart =
        rule.valueGroup && match.indices ? match.indices[rule.valueGroup]?.[0] : (match.index ?? 0);
      const valueEnd =
        rule.valueGroup && match.indices
          ? match.indices[rule.valueGroup]?.[1]
          : (match.index ?? 0) + match[0].length;
      if (valueStart === undefined || valueEnd === undefined) continue;
      const value = text.slice(valueStart, valueEnd);
      if (
        !passesValidator(value, rule.validate, { ...effective, context: text, start: valueStart })
      )
        continue;
      candidates.push({
        id: `${rule.id}:${valueStart}`,
        type: rule.type,
        ruleId: rule.id,
        start: valueStart,
        end: valueEnd,
        value,
        confidence: 1,
        priority: rule.priority,
      });
    }
  }
  candidates.push(...dictionaryMatches(text, effective));
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    if (ignoredHashes.has(hashValue(candidates[index].type, candidates[index].value)))
      candidates.splice(index, 1);
  }
  candidates.sort(
    (left, right) =>
      right.priority - left.priority ||
      right.end - right.start - (left.end - left.start) ||
      left.start - right.start,
  );
  /** @type {any[]} */
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.some((item) => overlaps(item, candidate))) continue;
    accepted.push(candidate);
  }
  return accepted
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map(({ priority, ...detection }) => detection);
}
