const PLACEHOLDER_PATTERNS = [
  /process\.env/i,
  /os\.environ/i,
  /getenv/i,
  /\$\{/,
  /\{\{/,
  /[<>]/,
  /^[$%]/,
  /^(?:x{4,}|\*{4,}|\.{3,}|your[_-]?.*|changeme|change[_-]?me|example|placeholder|password|secret|token|null|undefined|none|true|false)$/i,
];

/** @param {string} value */
const entropy = (value) => {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let result = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    result -= probability * Math.log2(probability);
  }
  return result;
};

/** @param {string} value */
export function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

/** @param {string} value */
export function shannonEntropy(value) {
  return value.length === 0 ? 0 : entropy(value);
}

/** @param {string} value @param {'relaxed'|'balanced'|'strict'} sensitivity */
export function isGenericSecret(value, sensitivity = 'balanced') {
  if (value.length < 8 || isPlaceholder(value)) return false;
  if (/^[A-Za-z0-9+/=_-]+$/.test(value) && /^([A-Za-z])\1+$/.test(value)) return false;
  const threshold = sensitivity === 'relaxed' ? 3.5 : sensitivity === 'strict' ? 2.5 : 3;
  const mixedLettersAndDigits = /[A-Za-z]/.test(value) && /\d/.test(value) && value.length >= 12;
  return shannonEntropy(value) >= threshold || mixedLettersAndDigits;
}

/** @param {string} value */
export function isOpenAiShape(value) {
  if (/^sk-(?:proj-|svcacct-|admin-)/.test(value)) return true;
  return /\d/.test(value) && shannonEntropy(value) >= 3.5;
}

/** @param {string} value @param {'relaxed'|'balanced'|'strict'} sensitivity */
export function isSensitiveEmail(value, sensitivity = 'balanced') {
  if (sensitivity === 'relaxed') return false;
  const domain = value.split('@')[1]?.toLowerCase() ?? '';
  return !/(^|\.)(?:example\.(?:com|org|net)|test|invalid|localhost)$/i.test(domain);
}

/** @param {string} value @param {'relaxed'|'balanced'|'strict'} sensitivity */
export function isSensitiveIpv4(value, sensitivity = 'balanced') {
  if (sensitivity === 'relaxed') return false;
  const octets = value.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => octet > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 127 || (a === 169 && b === 254) || value === '255.255.255.255') return false;
  if (
    sensitivity === 'balanced' &&
    ((a === 192 && b === 0) || (a === 198 && b === 51) || (a === 203 && b === 0))
  ) {
    return false;
  }
  return true;
}

/** @param {string} value @param {string} context @param {number} start */
export function isDatabaseUrl(value, context = '', start = 0, sensitivity = 'balanced') {
  try {
    const parsed = new URL(value);
    if (!parsed.protocol || !parsed.hostname) return false;
    if (sensitivity === 'strict') return true;
    if (parsed.password) return true;
    return !['localhost', '127.0.0.1', '::1', 'db', 'postgres', 'redis', 'mysql'].includes(
      parsed.hostname.toLowerCase(),
    );
  } catch {
    return false;
  }
}
