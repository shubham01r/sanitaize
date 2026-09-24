export const LIMITS = Object.freeze({
  CONFIG_TIMEOUT_MS: 2000,
  DEBOUNCE_MS: 150,
  TOAST_MS: 4000,
  PAUSE_MS: 900_000,
  MAX_SCAN_CHARS: 2_000_000,
  PREVIEW_MAX_CHARS: 200_000,
  VAULT_MAX_ENTRIES: 10_000,
  DICT_MAX_ENTRIES: 2_000,
  AUDIT_MAX_ENTRIES: 500,
  MOCK_MIN_LEN: 8,
  MOCK_RETRIES: 8,
  DICT_TERM_MIN: 2,
  DICT_TERM_MAX: 120,
});

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  sites: Object.freeze({ chatgpt: true, claude: true }),
  failMode: 'closed',
  sensitivity: 'balanced',
  detectors: Object.freeze({
    apiKeys: true,
    privateKeys: true,
    dbUrls: true,
    genericSecrets: true,
    emails: true,
    ipAddresses: true,
    hostNames: true,
    dictionary: true,
  }),
  dictionary: Object.freeze([]),
  ignoreHashes: Object.freeze([]),
});

/** @typedef {'relaxed'|'balanced'|'strict'} Sensitivity */
/** @typedef {'closed'|'open'} FailMode */
/** @typedef {string} DetectionType */
/** @typedef {{start:number,end:number}} Span */
/** @typedef {Object} Detection
 * @property {string} id
 * @property {DetectionType} type
 * @property {string} ruleId
 * @property {number} start
 * @property {number} end
 * @property {string} value
 * @property {Record<string, Span>} [groups]
 * @property {number} confidence
 * @property {string} [category]
 */
/** @typedef {{type:DetectionType,real:string,mock:string,createdAt:number,uses:number}} VaultEntry */
/** @typedef {{type:DetectionType,ruleId:string,mock:string,valueHash:string}} Replacement */
/** @typedef {{text:string,replacements:Replacement[],counts:Record<string,number>,latencyMs:number}} SanitizeResult */
