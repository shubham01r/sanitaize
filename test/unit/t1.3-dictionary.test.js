import { describe, expect, it } from 'vitest';
import { compileDictionary, matchDictionary } from '../../src/core/dictionary.js';

const entries = [
  { term: 'acme capital', aliases: ['AC'], category: 'client', caseSensitive: false },
  { term: 'Project Falcon', aliases: ['Falcon'], category: 'project', caseSensitive: false },
  { term: 'CaseExact', aliases: [], category: 'other', caseSensitive: true },
];

describe('T1.3 dictionary compiler', () => {
  it('matches case-insensitive terms, aliases, possessives, and Unicode boundaries', () => {
    const compiled = compileDictionary(entries);
    const matches = matchDictionary('ACME CAPITAL’s AC and acmeology', compiled);
    expect(matches.map((item) => item.value)).toEqual(['ACME CAPITAL', 'AC']);
    expect(matches[0]).toMatchObject({ type: 'DICTIONARY', category: 'client' });
  });

  it('does not match a dictionary term inside a larger word', () => {
    const compiled = compileDictionary(entries);
    expect(matchDictionary('acmeology and projectfalcon', compiled)).toEqual([]);
  });

  it('keeps case-sensitive entries exact while matching insensitive entries', () => {
    const compiled = compileDictionary(entries);
    expect(matchDictionary('CaseExact caseexact', compiled).map((item) => item.value)).toEqual([
      'CaseExact',
    ]);
  });

  it('deduplicates terms and skips disabled entries', () => {
    const compiled = compileDictionary([
      ...entries,
      { term: 'acme capital', aliases: ['AC'], category: 'duplicate', caseSensitive: false },
      { term: 'Disabled Name', enabled: false },
    ]);
    expect(compiled.terms).toHaveLength(5);
    expect(matchDictionary('Disabled Name', compiled)).toEqual([]);
  });

  it('compiles 2,000 entries within the performance budget', () => {
    const many = Array.from({ length: 2_000 }, (_, index) => ({
      term: `SyntheticTerm${index}`,
      aliases: [],
      category: 'other',
      caseSensitive: false,
    }));
    const start = performance.now();
    const compiled = compileDictionary(many);
    expect(compiled.terms).toHaveLength(2_000);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
