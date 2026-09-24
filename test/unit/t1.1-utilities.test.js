import { describe, expect, it } from 'vitest';
import { SanitaizeError, createSanitaizeError } from '../../src/core/errors.js';
import { hashValue, sha256 } from '../../src/core/hash.js';
import { maskValue } from '../../src/core/mask.js';
import { createRandomSource } from '../../src/core/random.js';
import { LIMITS, DEFAULT_CONFIG } from '../../src/core/types.js';

describe('T1.1 core utilities', () => {
  it('creates bounded crypto-backed random values without Math.random', () => {
    const random = createRandomSource();
    const value = random.alphanumeric(24);
    expect(value).toHaveLength(24);
    expect(value).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('supports deterministic random sources for tests', () => {
    let counter = 0;
    const random = createRandomSource({
      getRandomValues(array) {
        for (let index = 0; index < array.length; index += 1) {
          array[index] = counter++ % 256;
        }
        return array;
      },
    });
    expect(random.lowercase(8)).toBe('abcdefgh');
  });

  it('masks values according to their shape', () => {
    expect(maskValue('sk_test_1234567890abcdef', 'key')).toBe('sk_test_…cdef');
    expect(maskValue('short')).toBe('•••••');
    expect(maskValue('averylongpasswordvalue')).toBe('avery…alue');
  });

  it('hashes values with SHA-256 and returns the documented short hash', () => {
    const digest = sha256('sanitaize');
    expect(sha256('sanitaize')).toBe(
      '3d29ce0da96e2c191eda8dfdecdc69597cdcd6a2e8faa9b80901afbfeb349ff8',
    );
    expect(hashValue('GENERIC_SECRET', 'sanitaize')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('creates sanitized errors without input text', () => {
    const error = createSanitaizeError('E_LEAK_ASSERT');
    expect(error).toBeInstanceOf(SanitaizeError);
    expect(error.code).toBe('E_LEAK_ASSERT');
    expect(error.message).not.toContain('secret');
  });

  it('exports documented limits and defaults', () => {
    expect(LIMITS.MAX_SCAN_CHARS).toBe(2_000_000);
    expect(DEFAULT_CONFIG.sensitivity).toBe('balanced');
  });
});
