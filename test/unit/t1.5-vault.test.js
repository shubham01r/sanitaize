import { describe, expect, it } from 'vitest';
import { Vault } from '../../src/core/vault.js';

function detection(type, value) {
  return {
    id: `${type}:0`,
    type,
    ruleId: `test:${type}`,
    start: 0,
    end: value.length,
    value,
    confidence: 1,
  };
}

function generatorFor(prefix, counter = { value: 0 }) {
  return () => ({ mock: `${prefix}-${String(counter.value++).padStart(2, '0')}` });
}

describe('T1.5 vault', () => {
  it('maps the same normalized value to one mock and rehydrates case-insensitively', () => {
    const vault = new Vault();
    const first = vault.getOrCreate(
      detection('GENERIC_SECRET', 'Secret-Value'),
      generatorFor('mock'),
    );
    const second = vault.getOrCreate(
      detection('GENERIC_SECRET', 'Secret-Value'),
      generatorFor('other'),
    );
    expect(second).toBe(first);
    expect(vault.hasMock(first.toUpperCase())).toBe(true);
    expect(vault.rehydrateText(`before ${first.toUpperCase()} after`)).toBe(
      'before Secret-Value after',
    );
    expect(vault.stats()).toMatchObject({ size: 1, byType: { GENERIC_SECRET: 1 } });
  });

  it('keeps different types and real values separate', () => {
    const vault = new Vault();
    const a = vault.getOrCreate(detection('GENERIC_SECRET', 'same'), generatorFor('a'));
    const b = vault.getOrCreate(detection('EMAIL', 'same'), generatorFor('b'));
    const c = vault.getOrCreate(detection('GENERIC_SECRET', 'different'), generatorFor('c'));
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('rejects mocks that collide with existing prefix/suffix entries', () => {
    const vault = new Vault();
    const first = vault.getOrCreate(detection('GENERIC_SECRET', 'one'), () => ({
      mock: 'standin',
    }));
    expect(() =>
      vault.getOrCreate(detection('GENERIC_SECRET', 'two'), () => ({ mock: 'standin-extra' })),
    ).toThrow();
    expect(() =>
      vault.getOrCreate(detection('GENERIC_SECRET', 'three'), () => ({ mock: 'prefix-standin' })),
    ).toThrow();
    expect(vault.stats().size).toBe(1);
    expect(first).toBe('standin');
  });

  it('retries generation when a candidate collides with an existing mock', () => {
    const vault = new Vault();
    vault.getOrCreate(detection('GENERIC_SECRET', 'existing'), () => ({ mock: 'same' }));
    let attempts = 0;
    const mock = vault.getOrCreate(detection('GENERIC_SECRET', 'value'), () => {
      attempts += 1;
      return { mock: attempts < 3 ? 'same' : 'safe-mock' };
    });
    expect(mock).toBe('safe-mock');
    expect(attempts).toBe(3);
  });

  it('enforces the entry cap with E_VAULT_FULL', () => {
    const vault = new Vault({ maxEntries: 1 });
    vault.getOrCreate(detection('GENERIC_SECRET', 'one'), generatorFor('one'));
    let error;
    try {
      vault.getOrCreate(detection('GENERIC_SECRET', 'two'), generatorFor('two'));
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'E_VAULT_FULL' });
  });

  it('finds complete mocks and reports partial mock suffixes', () => {
    const vault = new Vault();
    const mock = vault.getOrCreate(detection('GENERIC_SECRET', 'value'), () => ({
      mock: 'split-token-123',
    }));
    expect(vault.findMockMatches(`a ${mock} b`)).toEqual([
      expect.objectContaining({ start: 2, end: 2 + mock.length, mock, real: 'value' }),
    ]);
    expect(vault.longestMockPrefixSuffix(`prefix ${mock.slice(0, 6)}`)).toBe(6);
    expect(vault.longestMockPrefixSuffix(`prefix ${mock.slice(0, 6)}`, 8)).toBe(0);
    expect(vault.longestMockPrefixSuffix('unrelated')).toBe(0);
  });

  it('registers composite component reverse mappings', () => {
    const vault = new Vault();
    const result = vault.getOrCreate(detection('DB_URL', 'postgres://user:pass@host/db'), () => ({
      mock: 'postgres://safe_user:safe_pass@safe_host/db_safe',
      components: [
        { real: 'user', mock: 'safe_user', type: 'GENERIC_SECRET' },
        { real: 'pass', mock: 'safe_pass', type: 'GENERIC_SECRET' },
      ],
    }));
    expect(result).toBe('postgres://safe_user:safe_pass@safe_host/db_safe');
    expect(vault.rehydrateText('safe_user and safe_pass')).toBe('user and pass');
  });

  it('clears all mappings and statistics', () => {
    const vault = new Vault();
    vault.getOrCreate(detection('GENERIC_SECRET', 'value'), generatorFor('mock'));
    vault.clear();
    expect(vault.stats()).toEqual({ size: 0, byType: {} });
    expect(vault.rehydrateText('mock-00')).toBe('mock-00');
  });
});
