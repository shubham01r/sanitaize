const DEFAULT_ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DEFAULT_UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DEFAULT_DIGITS = '0123456789';
const DEFAULT_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * @typedef {Object} RandomSource
 * @property {(length:number) => Uint8Array} bytes
 * @property {(length:number, alphabet?:string) => string} string
 * @property {(length:number) => string} alphanumeric
 * @property {(length:number) => string} lowercase
 * @property {(length:number) => string} digits
 * @property {(length:number) => string} uppercase
 * @property {(length:number) => string} base32
 * @property {(length:number) => string} base64url
 * @property {<T>(items: readonly T[]) => T} choice
 */

/**
 * @param {{getRandomValues: (array: Uint8Array) => Uint8Array}} [cryptoSource]
 * @returns {RandomSource}
 */
export function createRandomSource(cryptoSource = globalThis.crypto) {
  if (!cryptoSource || typeof cryptoSource.getRandomValues !== 'function') {
    throw new Error('A cryptographic random source is required.');
  }

  /** @param {number} length */
  const bytes = (length) => {
    if (!Number.isInteger(length) || length < 0) throw new RangeError('Invalid random length.');
    if (length === 0) return new Uint8Array();
    if (length > 65_536) throw new RangeError('Random chunk is too large.');
    return cryptoSource.getRandomValues(new Uint8Array(length));
  };

  /**
   * @param {number} length
   * @param {string} alphabet
   */
  const string = (length, alphabet = DEFAULT_ALPHANUMERIC) => {
    if (!Number.isInteger(length) || length < 0) throw new RangeError('Invalid random length.');
    if (alphabet.length === 0) throw new RangeError('Random alphabet cannot be empty.');
    const source = bytes(length);
    let output = '';
    for (let index = 0; index < source.length; index += 1) {
      output += alphabet[source[index] % alphabet.length];
    }
    return output;
  };

  return {
    bytes,
    string,
    alphanumeric: (length) => string(length, DEFAULT_ALPHANUMERIC),
    lowercase: (length) => string(length, DEFAULT_LOWERCASE),
    digits: (length) => string(length, DEFAULT_DIGITS),
    uppercase: (length) => string(length, DEFAULT_UPPERCASE),
    base32: (length) => string(length, DEFAULT_BASE32),
    base64url: (length) => string(length, DEFAULT_BASE64URL),
    choice: (items) => {
      if (items.length === 0) throw new RangeError('Cannot choose from an empty list.');
      return items[bytes(1)[0] % items.length];
    },
  };
}
