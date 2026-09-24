import { randomAlphanumeric, randomBase32, randomBase64Url, shapeMockValue } from './common.js';
import {
  anthropic,
  awsAccessKey,
  awsSecret,
  github,
  google,
  jwt,
  openai,
  slack,
  stripe,
  stripeWebhook,
} from './providers.js';
import { dburl, email, entity, host, ipv4, pem } from './structures.js';

/** @type {Record<string, (detection:any, ctx:any) => {mock:string,components?:any[]}>} */
const generators = Object.freeze({
  stripe,
  'stripe-webhook': stripeWebhook,
  'aws-akid': awsAccessKey,
  'aws-secret': awsSecret,
  github,
  openai,
  anthropic,
  google,
  slack,
  jwt,
  pem,
  dburl,
  /** @param {any} detection @param {any} ctx */
  shape: (detection, ctx) => ({ mock: shapeMockValue(detection.value, ctx.rand) }),
  email,
  ipv4,
  host,
  entity,
});

/** @param {string} id */
export function getGenerator(id) {
  return generators[id];
}

/** @param {any} detection @param {any} ctx */
export function generateMock(detection, ctx) {
  const generator = getGenerator(detection.generator ?? generatorForType(detection.type));
  if (!generator) throw new Error(`No generator registered for ${detection.type}.`);
  return generator(detection, ctx);
}

/** @param {string} type */
function generatorForType(type) {
  return {
    STRIPE_KEY: 'stripe',
    STRIPE_WEBHOOK: 'stripe-webhook',
    AWS_ACCESS_KEY_ID: 'aws-akid',
    AWS_SECRET_KEY: 'aws-secret',
    GITHUB_TOKEN: 'github',
    OPENAI_KEY: 'openai',
    ANTHROPIC_KEY: 'anthropic',
    GOOGLE_API_KEY: 'google',
    SLACK_TOKEN: 'slack',
    JWT: 'jwt',
    PEM_PRIVATE_KEY: 'pem',
    DB_URL: 'dburl',
    GENERIC_SECRET: 'shape',
    EMAIL: 'email',
    IPV4: 'ipv4',
    INTERNAL_HOST: 'host',
    DICTIONARY: 'entity',
  }[type];
}

export { randomAlphanumeric, randomBase32, randomBase64Url };
