import { createSanitaizeError } from './errors.js';
import { LIMITS } from './types.js';

/** @param {string} type @param {string} value */
const normalize = (type, value) => {
  const trimmed = value.trim();
  return ['EMAIL', 'INTERNAL_HOST', 'DICTIONARY'].includes(type) ? trimmed.toLowerCase() : trimmed;
};

export class Vault {
  /** @param {{maxEntries?:number,MapClass?:any}} [options] */
  constructor(options = {}) {
    this.maxEntries = options.maxEntries ?? LIMITS.VAULT_MAX_ENTRIES;
    this.MapClass = options.MapClass ?? Map;
    /** @type {Map<string, {type:string,real:string,mock:string,createdAt:number,uses:number}>} */
    this.forward = new this.MapClass();
    /** @type {Map<string, {type:string,real:string,mock:string}>} */
    this.reverse = new this.MapClass();
    /** @type {Set<string>} */
    this.prefixes = new Set();
    this.version = 0;
  }

  /** @param {string} type @param {string} value */
  key(type, value) {
    return `${type}\u0000${normalize(type, value)}`;
  }

  /** @param {string} mock */
  isCollision(mock) {
    const lower = mock.toLowerCase();
    if (this.reverse.has(lower)) return true;
    for (const existing of this.reverse.values()) {
      const other = existing.mock.toLowerCase();
      if (
        lower.startsWith(other) ||
        other.startsWith(lower) ||
        lower.endsWith(other) ||
        other.endsWith(lower)
      ) {
        return true;
      }
    }
    return false;
  }

  /** @param {string} mock */
  addPrefixes(mock) {
    const lower = mock.toLowerCase();
    for (let index = 1; index < lower.length; index += 1) this.prefixes.add(lower.slice(0, index));
  }

  /**
   * @param {any} detection
   * @param {(detection:any) => {mock:string,components?:Array<{real:string,mock:string,type:string}>}} generator
   */
  getOrCreate(detection, generator) {
    const key = this.key(detection.type, detection.value);
    const existing = this.forward.get(key);
    if (existing) {
      existing.uses += 1;
      return existing.mock;
    }
    if (this.forward.size >= this.maxEntries) throw createSanitaizeError('E_VAULT_FULL');
    let result;
    for (let attempt = 0; attempt < LIMITS.MOCK_RETRIES; attempt += 1) {
      result = generator(detection);
      if (result.mock !== detection.value && !this.isCollision(result.mock)) break;
      if (attempt === LIMITS.MOCK_RETRIES - 1) throw createSanitaizeError('E_MOCK_COLLISION');
    }
    if (!result) throw createSanitaizeError('E_MOCK_COLLISION');
    const entry = {
      type: detection.type,
      real: detection.value,
      mock: result.mock,
      createdAt: Date.now(),
      uses: 1,
    };
    this.forward.set(key, entry);
    this.reverse.set(result.mock.toLowerCase(), {
      type: entry.type,
      real: entry.real,
      mock: entry.mock,
    });
    this.addPrefixes(result.mock);
    for (const component of result.components ?? []) {
      if (component.real === component.mock || this.isCollision(component.mock)) continue;
      this.reverse.set(component.mock.toLowerCase(), {
        type: component.type,
        real: component.real,
        mock: component.mock,
      });
      this.addPrefixes(component.mock);
    }
    this.version += 1;
    return result.mock;
  }

  /** @param {string} value */
  hasMock(value) {
    return this.reverse.has(value.toLowerCase());
  }

  /** @param {string} value */
  findMockMatches(value) {
    const lower = value.toLowerCase();
    const matches = [];
    for (const [mock, entry] of this.reverse) {
      let start = lower.indexOf(mock);
      while (start !== -1) {
        matches.push({
          start,
          end: start + mock.length,
          mock: entry.mock,
          real: entry.real,
          type: entry.type,
        });
        start = lower.indexOf(mock, start + 1);
      }
    }
    return matches.sort((left, right) => left.start - right.start || right.end - left.end);
  }

  /** @param {string} value */
  rehydrateText(value) {
    const matches = this.findMockMatches(value).filter(
      (match, index, all) => index === 0 || match.start >= all[index - 1].end,
    );
    let result = value;
    for (const match of matches.reverse())
      result = `${result.slice(0, match.start)}${match.real}${result.slice(match.end)}`;
    return result;
  }

  /**
   * @param {string} value
   * @param {number} [minStart]
   */
  longestMockPrefixSuffix(value, minStart = 0) {
    const lower = value.toLowerCase();
    const firstStart = Math.max(0, Math.min(minStart, lower.length));
    for (let start = firstStart; start < lower.length; start += 1) {
      if (this.prefixes.has(lower.slice(start))) return lower.length - start;
    }
    return 0;
  }

  stats() {
    /** @type {Record<string, number>} */
    const byType = {};
    for (const entry of this.forward.values()) byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    return { size: this.forward.size, byType };
  }

  clear() {
    this.forward.clear();
    this.reverse.clear();
    this.prefixes.clear();
    this.version += 1;
  }
}
