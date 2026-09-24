import {
  different,
  randomAlphanumeric,
  randomBase32,
  randomBase64Url,
  shapeMockValue,
} from './common.js';

/**
 * @param {string} value
 * @param {string} prefix
 * @param {(length:number) => string} makeBody
 */
const sameLength = (value, prefix, makeBody) => {
  const length = Math.max(0, value.length - prefix.length);
  return different(value, prefix + makeBody(length));
};

/** @param {any} detection @param {any} ctx */
export const stripe = (detection, ctx) => {
  const value = detection.value;
  const match = value.match(/^(sk|rk|pk)_(?:live|test)_/);
  if (!match) return { mock: shapeMockValue(value, ctx.rand) };
  return {
    mock: sameLength(value, `${match[1]}_test_mock`, (length) =>
      randomAlphanumeric(length, ctx.rand),
    ),
  };
};

/** @param {any} detection @param {any} ctx */
export const stripeWebhook = (detection, ctx) => ({
  mock: sameLength(detection.value, 'whsec_mock', (length) => randomAlphanumeric(length, ctx.rand)),
});

/** @param {any} detection @param {any} ctx */
export const awsAccessKey = (detection, ctx) => {
  const value = detection.value;
  const prefix = value.slice(0, 4);
  return { mock: different(value, prefix + 'MOCK' + randomBase32(16 - 4, ctx.rand)) };
};

/** @param {any} detection @param {any} ctx */
export const awsSecret = (detection, ctx) => ({ mock: randomAlphanumeric(40, ctx.rand) });

/** @param {any} detection @param {any} ctx */
export const github = (detection, ctx) => {
  const value = detection.value;
  const prefix = value.startsWith('github_pat_')
    ? 'github_pat_'
    : (value.match(/^gh[pousr]_/)?.[0] ?? '');
  return { mock: sameLength(value, prefix, (length) => randomAlphanumeric(length, ctx.rand)) };
};

/** @param {any} detection @param {any} ctx */
export const openai = (detection, ctx) => {
  const value = detection.value;
  const prefix = value.match(/^sk-(?:proj-|svcacct-|admin-)?/)?.[0] ?? 'sk-';
  return { mock: sameLength(value, prefix, (length) => randomAlphanumeric(length, ctx.rand)) };
};

/** @param {any} detection @param {any} ctx */
export const anthropic = (detection, ctx) => {
  const value = detection.value;
  const prefix = value.match(/^sk-ant-api\d+-/)?.[0] ?? 'sk-ant-api03-';
  return { mock: sameLength(value, prefix, (length) => randomAlphanumeric(length, ctx.rand)) };
};

/** @param {any} detection @param {any} ctx */
export const google = (detection, ctx) => ({
  mock: sameLength(detection.value, 'AIza', (length) => randomAlphanumeric(length, ctx.rand)),
});

/** @param {any} detection @param {any} ctx */
export const slack = (detection, ctx) => {
  const value = detection.value;
  const segments = value.split('-');
  const mock = segments
    .map(
      /** @param {string} segment @param {number} index */
      (segment, index) => (index === 0 ? segment : randomAlphanumeric(segment.length, ctx.rand)),
    )
    .join('-');
  return { mock: different(value, mock) };
};

/** @param {any} detection @param {any} ctx */
export const jwt = (detection, ctx) => {
  const value = detection.value;
  const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const payload = 'eyJzdWIiOiJtb2NrLXVzZXIiLCJtb2NrIjp0cnVlfQ';
  const signatureLength = Math.max(8, value.length - header.length - payload.length - 2);
  return {
    mock: different(value, `${header}.${payload}.${randomBase64Url(signatureLength, ctx.rand)}`),
  };
};
