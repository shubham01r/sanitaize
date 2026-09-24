import { LIMITS } from './types.js';

/** @typedef {{term:string,aliases?:string[],category?:string,caseSensitive?:boolean,enabled?:boolean}} DictionaryEntry */
/** @typedef {{term:string,category?:string,caseSensitive:boolean}} CompiledTerm */
/** @typedef {{insensitive:RegExp|null,sensitive:RegExp|null,terms:CompiledTerm[]}} CompiledDictionary */

/** @param {string} term */
const escapeRegex = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
/** @param {string} term */
const termKey = (term) => term.normalize('NFKC').toLocaleLowerCase();

/** @param {DictionaryEntry[]} entries */
export function compileDictionary(entries) {
  const unique = new Map();
  for (const entry of entries) {
    if (entry.enabled === false || typeof entry.term !== 'string') continue;
    const terms = [entry.term, ...(entry.aliases ?? [])].filter(
      (term) =>
        typeof term === 'string' &&
        term.length >= LIMITS.DICT_TERM_MIN &&
        term.length <= LIMITS.DICT_TERM_MAX,
    );
    for (const term of terms) {
      const key = termKey(term);
      if (unique.has(key)) continue;
      unique.set(key, {
        term,
        category: entry.category,
        caseSensitive: entry.caseSensitive === true,
      });
    }
  }
  const compiled = [...unique.values()].sort((left, right) => right.term.length - left.term.length);
  const insensitive = compiled.filter((entry) => !entry.caseSensitive);
  const sensitive = compiled.filter((entry) => entry.caseSensitive);
  /** @param {CompiledTerm[]} items @param {string} flags */
  const makeRegex = (items, flags) =>
    items.length === 0
      ? null
      : new RegExp(
          `(?<![\\p{L}\\p{N}_])(?:${items.map((item) => escapeRegex(item.term)).join('|')})(?![\\p{L}\\p{N}_])`,
          flags,
        );
  return {
    insensitive: makeRegex(insensitive, 'giu'),
    sensitive: makeRegex(sensitive, 'gu'),
    terms: compiled,
  };
}

/** @param {string} text @param {CompiledDictionary} dictionary */
export function matchDictionary(text, dictionary) {
  const matches = [];
  /** @type {Array<[RegExp|null, boolean]>} */
  const regexes = [
    [dictionary.insensitive, false],
    [dictionary.sensitive, true],
  ];
  for (const [regex, caseSensitive] of regexes) {
    if (!regex) continue;
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      const term = dictionary.terms.find(
        (item) =>
          item.term === value ||
          (!caseSensitive && item.term.toLocaleLowerCase() === value.toLocaleLowerCase()),
      );
      if (!term) continue;
      const start = match.index ?? 0;
      matches.push({
        id: `dictionary:${start}`,
        type: 'DICTIONARY',
        ruleId: 'dictionary',
        start,
        end: start + value.length,
        value,
        category: term.category,
        confidence: 0.9,
        priority: 30,
      });
    }
  }
  return matches.sort(
    (left, right) => left.start - right.start || right.end - left.start - (left.end - left.start),
  );
}
