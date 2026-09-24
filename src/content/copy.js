const TYPE_LABELS = Object.freeze({
  API_KEY: 'API key',
  OPENAI_KEY: 'API key',
  ANTHROPIC_KEY: 'API key',
  GITHUB_TOKEN: 'Token',
  AWS_ACCESS_KEY_ID: 'API key',
  AWS_SECRET_KEY: 'Secret',
  GENERIC_SECRET: 'Secret',
  STRIPE_KEY: 'API key',
  STRIPE_WEBHOOK: 'Token',
  GOOGLE_API_KEY: 'API key',
  SLACK_TOKEN: 'Token',
  JWT: 'Token',
  PEM_PRIVATE_KEY: 'Private key',
  DB_URL: 'Database URL',
  EMAIL: 'Email',
  IPV4: 'IP address',
  INTERNAL_HOST: 'Host name',
  DICTIONARY: 'Client name',
});

/** @param {string} type */
export function labelForType(type) {
  return TYPE_LABELS[type] ?? 'Sensitive value';
}

/** @param {string} type */
export function maskDetection(type, value) {
  if (type === 'DICTIONARY') return value;
  if (type === 'DB_URL') return `${value.slice(0, 12)}…/${value.split('/').pop() ?? ''}`;
  if (type === 'PEM_PRIVATE_KEY') return 'Private key';
  if (type === 'EMAIL') return value.replace(/^[^@]+/, '••••');
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

/** @param {string} code */
export function errorCopy(code) {
  const messages = {
    E_CONFIG_TIMEOUT: 'SanitAIze wasn’t ready in time. Wait a moment, then send again.',
    E_PARSE_BODY: 'The site changed how it sends messages. This message was not sent.',
    E_UNSUPPORTED_BODY: 'This message format is not supported safely. It was not sent.',
    E_LEAK_ASSERT: 'SanitAIze could not confirm a sensitive value was removed. Edit and try again.',
    E_VAULT_FULL: 'This tab’s stand-in list is full. Clear it from the popup, then try again.',
    E_MOCK_COLLISION: 'A unique stand-in could not be created. Try again.',
    E_INPUT_TOO_LARGE: 'This message is too large to check safely. Split it into smaller messages.',
    E_TRANSFORM_FAIL: 'Something went wrong while protecting this message. Try again.',
    W_ADAPTER_UNKNOWN_SHAPE: 'This site changed. SanitAIze checked every part of the message.',
    W_PATCH_REPLACED: 'The page replaced the protection hook. SanitAIze restored it.',
    W_PATCH_LOST: 'Not protecting — reload this tab.',
    W_STREAM_PARSE: 'The reply stream was unusual. Showing the unmodified response.',
  };
  return messages[code] ?? 'SanitAIze could not complete the protection check.';
}

/** @param {number} count */
export function successCopy(count) {
  return `${count} ${count === 1 ? 'value' : 'values'} replaced with stand-ins. Your real data stayed in this tab.`;
}
