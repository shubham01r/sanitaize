import { describe, expect, it } from 'vitest';
import { detect } from '../../src/core/detect.js';
import { hashValue } from '../../src/core/hash.js';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import {
  fakeAnthropicKey,
  fakeAwsKeyId,
  fakeAwsSecretKey,
  fakeClientName,
  fakeDbUrl,
  fakeEmail,
  fakeFineGrainedToken,
  fakeGenericSecret,
  fakeGitHubToken,
  fakeGoogleKey,
  fakeInternalHost,
  fakeIpv4,
  fakeJwt,
  fakeOpenAIKey,
  fakePem,
  fakeSlackToken,
  fakeStripeKey,
} from '../helpers/fake-secrets.js';

const cfg = { ...DEFAULT_CONFIG, detectors: { ...DEFAULT_CONFIG.detectors } };

function types(text, options = cfg) {
  return detect(text, options).map((item) => item.type);
}

describe('T1.2 detection catalog', () => {
  it.each([
    ['Stripe', fakeStripeKey(), 'STRIPE_KEY'],
    ['AWS access key', fakeAwsKeyId(), 'AWS_ACCESS_KEY_ID'],
    ['GitHub token', fakeGitHubToken(), 'GITHUB_TOKEN'],
    ['fine-grained GitHub token', fakeFineGrainedToken(), 'GITHUB_TOKEN'],
    ['OpenAI key', fakeOpenAIKey(), 'OPENAI_KEY'],
    ['Anthropic key', fakeAnthropicKey(), 'ANTHROPIC_KEY'],
    ['Google key', fakeGoogleKey(), 'GOOGLE_API_KEY'],
    ['Slack token', fakeSlackToken(), 'SLACK_TOKEN'],
    ['JWT', fakeJwt(), 'JWT'],
    ['PEM key', fakePem(), 'PEM_PRIVATE_KEY'],
    ['database URL', fakeDbUrl(), 'DB_URL'],
    ['email', fakeEmail(), 'EMAIL'],
    ['internal host', fakeInternalHost(), 'INTERNAL_HOST'],
    ['IPv4', fakeIpv4(), 'IPV4'],
    ['generic assignment', `token = "${fakeGenericSecret()}"`, 'GENERIC_SECRET'],
  ])('detects %s', (_name, value, type) => {
    expect(types(value)).toContain(type);
  });

  it('detects AWS secret values inside assignments', () => {
    expect(types(`aws_secret_key = "${fakeAwsSecretKey()}"`)).toContain('AWS_SECRET_KEY');
  });

  it.each([
    'process.env.STRIPE_KEY',
    'os.environ["OPENAI_KEY"]',
    'const token = "your-token-here"',
    'const password = "example"',
    'const secret = "xxxxxxxx"',
    'const value = "getSecret();"',
    'email user@example.com',
    'loopback 127.0.0.1',
    'version 1.2.3.4',
  ])('rejects placeholder or non-sensitive input: %s', (value) => {
    expect(types(value)).not.toContain('GENERIC_SECRET');
  });

  it('resolves overlapping detections with the higher-priority rule', () => {
    const found = detect(`${fakeDbUrl()} and ${fakeEmail()} and ${fakeIpv4()}`, cfg);
    expect(found.map((item) => item.type)).toEqual(['DB_URL', 'EMAIL', 'IPV4']);
    expect(found[0].start).toBe(0);
  });

  it('honors detector toggles and strict-only publishable keys', () => {
    expect(
      types('pk_test_ABCDEFGHIJKLMNOP', {
        ...cfg,
        detectors: { ...cfg.detectors, apiKeys: false },
      }),
    ).toEqual([]);
    expect(types('pk_test_ABCDEFGHIJKLMNOP', { ...cfg, sensitivity: 'strict' })).toContain(
      'STRIPE_KEY',
    );
  });

  it('drops values whose short hash is ignored', () => {
    const value = fakeStripeKey();
    const ignored = { ...cfg, ignoreHashes: [hashValue('STRIPE_KEY', value)] };
    expect(types(value, ignored)).toEqual([]);
  });

  it('throws for oversized outbound text', () => {
    expect(() => detect('x'.repeat(2_000_001), cfg)).toThrow('too large');
  });

  it('keeps every rule linear on adversarial input', () => {
    const adversarial = `${'a'.repeat(200_000)}!`;
    const start = performance.now();
    detect(adversarial, cfg);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
