import { describe, expect, it } from 'vitest';
import { generateMock, getGenerator } from '../../src/core/generators/index.js';
import {
  fakeAnthropicKey,
  fakeAwsKeyId,
  fakeAwsSecretKey,
  fakeClientName,
  fakeDbUrl,
  fakeEmail,
  fakeGoogleKey,
  fakeInternalHost,
  fakeIpv4,
  fakeJwt,
  fakeOpenAIKey,
  fakePem,
  fakeSlackToken,
  fakeStripeKey,
  fakeGenericSecret,
} from '../helpers/fake-secrets.js';
import { createRandomSource } from '../../src/core/random.js';

const random = createRandomSource({
  getRandomValues(array) {
    for (let index = 0; index < array.length; index += 1) array[index] = (index * 17 + 3) % 256;
    return array;
  },
});

function detection(type, value) {
  return { type, ruleId: `test:${type}`, start: 0, end: value.length, value, confidence: 1 };
}

describe('T1.4 generators', () => {
  it.each([
    ['STRIPE_KEY', fakeStripeKey()],
    ['STRIPE_WEBHOOK', 'whsec_FAKE0123456789ABCDEF'],
    ['AWS_ACCESS_KEY_ID', fakeAwsKeyId()],
    ['AWS_SECRET_KEY', fakeAwsSecretKey()],
    ['GITHUB_TOKEN', 'ghp_FAKE0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
    ['OPENAI_KEY', fakeOpenAIKey()],
    ['ANTHROPIC_KEY', fakeAnthropicKey()],
    ['GOOGLE_API_KEY', fakeGoogleKey()],
    ['SLACK_TOKEN', fakeSlackToken()],
    ['JWT', fakeJwt()],
    ['PEM_PRIVATE_KEY', fakePem()],
    ['DB_URL', fakeDbUrl()],
    ['GENERIC_SECRET', fakeGenericSecret()],
    ['EMAIL', fakeEmail()],
    ['IPV4', fakeIpv4()],
    ['INTERNAL_HOST', fakeInternalHost()],
    ['DICTIONARY', fakeClientName()],
  ])('generates a distinct same-length mock for %s', (type, value) => {
    const result = generateMock(detection(type, value), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: value,
    });
    expect(result.mock).not.toBe(value);
    if (!['PEM_PRIVATE_KEY', 'EMAIL', 'IPV4', 'DB_URL', 'DICTIONARY'].includes(type)) {
      expect(result.mock).toHaveLength(value.length);
    }
  });

  it('uses a recognizable, valid JWT payload', () => {
    const result = generateMock(detection('JWT', fakeJwt()), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: fakeJwt(),
    });
    const [header, payload] = result.mock.split('.');
    expect(JSON.parse(atob(header.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({
      alg: 'HS256',
      typ: 'JWT',
    });
    expect(JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({
      sub: 'mock-user',
      mock: true,
    });
  });

  it('preserves PEM labels and line structure', () => {
    const value = fakePem();
    const result = generateMock(detection('PEM_PRIVATE_KEY', value), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: value,
    });
    expect(result.mock.split('\n')[0]).toBe(value.split('\n')[0]);
    expect(result.mock.split('\n').at(-1)).toBe(value.split('\n').at(-1));
    expect(result.mock.split('\n')).toHaveLength(value.split('\n').length);
  });

  it('keeps database URLs parseable and returns component mappings', () => {
    const result = generateMock(detection('DB_URL', fakeDbUrl()), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: fakeDbUrl(),
    });
    expect(() => new URL(result.mock)).not.toThrow();
    expect(result.components?.length).toBeGreaterThan(0);
  });

  it('preserves Slack dash-segment lengths and generates valid IPv4 output', () => {
    const slack = generateMock(detection('SLACK_TOKEN', fakeSlackToken()), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: fakeSlackToken(),
    });
    expect(slack.mock.split('-').map((part) => part.length)).toEqual(
      fakeSlackToken()
        .split('-')
        .map((part) => part.length),
    );
    const ip = generateMock(detection('IPV4', fakeIpv4()), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: fakeIpv4(),
    });
    expect(ip.mock.split('.').every((part) => Number(part) <= 255)).toBe(true);
  });

  it('preserves partial PEM structure without inventing an end label', () => {
    const value = '-----BEGIN PRIVATE KEY-----\\nRkFLRVBBT0NJTUFDRVNZUQVRFRA==';
    const result = generateMock(detection('PEM_PRIVATE_KEY', value), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: value,
    });
    expect(result.mock.startsWith('-----BEGIN PRIVATE KEY-----')).toBe(true);
    expect(result.mock).not.toContain('-----END PRIVATE KEY-----');
  });

  it('uses the documented AWS secret character set', () => {
    const value = fakeAwsSecretKey();
    const result = generateMock(detection('AWS_SECRET_KEY', value), {
      rand: random,
      vault: { hasMock: () => false },
      sourceText: value,
    });
    expect(result.mock).toHaveLength(40);
    expect(result.mock).toMatch(/^[A-Za-z0-9+/]+$/);
  });

  it('exposes a generator for every documented type', () => {
    for (const type of [
      'stripe',
      'aws-akid',
      'aws-secret',
      'github',
      'openai',
      'anthropic',
      'google',
      'slack',
      'jwt',
      'pem',
      'dburl',
      'shape',
      'email',
      'ipv4',
      'host',
      'entity',
    ]) {
      expect(getGenerator(type)).toBeTypeOf('function');
    }
  });
});
