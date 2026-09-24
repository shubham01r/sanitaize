import { shapeMock } from './shape.js';

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** @param {number} length @param {string} alphabet @param {any} rand */
export function randomString(length, alphabet, rand) {
  return rand.string(length, alphabet);
}

/** @param {string} value @param {string} candidate */
export function different(value, candidate) {
  return candidate !== value
    ? candidate
    : `${candidate.slice(0, -1)}${candidate.slice(-1) === 'a' ? 'b' : 'a'}`;
}

/** @param {number} length @param {any} rand */
export function randomAlphanumeric(length, rand) {
  return randomString(length, ALPHANUMERIC, rand);
}

/** @param {number} length @param {any} rand */
export function randomBase32(length, rand) {
  return randomString(length, BASE32, rand);
}

/** @param {number} length @param {any} rand */
export function randomBase64(length, rand) {
  return randomString(length, BASE64, rand);
}

/** @param {number} length @param {any} rand */
export function randomBase64Url(length, rand) {
  return randomString(length, BASE64URL, rand);
}

/** @param {string} value @param {any} rand */
export function shapeMockValue(value, rand) {
  return different(value, shapeMock(value, rand));
}
