/** @type {Record<string, string>} */
const ERROR_MESSAGES = Object.freeze({
  E_CONFIG_TIMEOUT: 'SanitAIze was not ready in time.',
  E_PARSE_BODY: 'The request body could not be parsed safely.',
  E_UNSUPPORTED_BODY: 'The request body shape is not supported safely.',
  E_INPUT_TOO_LARGE: 'The input is too large to check safely.',
  E_LEAK_ASSERT: 'Sensitive-value removal could not be confirmed.',
  E_VAULT_FULL: 'The stand-in list is full.',
  E_MOCK_COLLISION: 'A unique safe stand-in could not be generated.',
  E_TRANSFORM_FAIL: 'SanitAIze could not protect the request.',
});

export class SanitaizeError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(ERROR_MESSAGES[code] ?? 'SanitAIze could not complete the operation.');
    this.name = 'SanitaizeError';
    this.code = code;
  }
}

/** @param {string} code */
export function createSanitaizeError(code) {
  return new SanitaizeError(code);
}
