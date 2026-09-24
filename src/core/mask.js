/**
 * @param {string} value
 * @param {'generic'|'key'|'password'} [kind]
 */
export function maskValue(value, kind = 'generic') {
  if (kind === 'password') return '•'.repeat(Math.max(5, Math.min(value.length, 12)));
  if (value.length <= 8) return '•'.repeat(Math.max(5, value.length));
  const visibleStart = kind === 'key' ? 8 : 5;
  return `${value.slice(0, visibleStart)}…${value.slice(-4)}`;
}
