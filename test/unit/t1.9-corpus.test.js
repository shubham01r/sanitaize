import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from '../../src/core/detect.js';
import { DEFAULT_CONFIG } from '../../src/core/types.js';
import {
  fakeAnthropicKey,
  fakeAwsKeyId,
  fakeDbUrl,
  fakeEmail,
  fakeGitHubToken,
  fakeGoogleKey,
  fakeIpv4,
  fakeJwt,
  fakeOpenAIKey,
  fakePem,
  fakeSlackToken,
  fakeStripeKey,
} from '../helpers/fake-secrets.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const positive = JSON.parse(
  await readFile(join(root, 'test/fixtures/corpus/positive.json'), 'utf8'),
);
const clean = JSON.parse(await readFile(join(root, 'test/fixtures/corpus/clean.json'), 'utf8'));

describe('T1.9 detection corpus', () => {
  it('contains labelled positive examples for every provider rule', () => {
    expect(positive.length).toBeGreaterThanOrEqual(20);
    expect(new Set(positive.map((item) => item.type)).size).toBeGreaterThanOrEqual(10);
  });

  it('contains the documented 500 clean snippets', () => {
    expect(clean).toHaveLength(500);
  });

  it('meets the provider recall and clean false-positive targets', () => {
    const providerTypes = new Set([
      'STRIPE_KEY',
      'AWS_ACCESS_KEY_ID',
      'GITHUB_TOKEN',
      'OPENAI_KEY',
      'ANTHROPIC_KEY',
      'GOOGLE_API_KEY',
      'SLACK_TOKEN',
      'JWT',
    ]);
    let providerHits = 0;
    let providerTotal = 0;
    for (const item of positive.filter((entry) => providerTypes.has(entry.type))) {
      providerTotal += 1;
      if (detect(item.text, DEFAULT_CONFIG).some((detection) => detection.type === item.type))
        providerHits += 1;
    }
    const falsePositives = clean.filter((text) => detect(text, DEFAULT_CONFIG).length > 0).length;
    expect(providerHits / providerTotal).toBeGreaterThanOrEqual(0.95);
    expect(falsePositives / clean.length).toBeLessThanOrEqual(0.02);
  });

  it('uses only runtime-built fake values in the positive corpus', () => {
    const values = [
      fakeStripeKey(),
      fakeAwsKeyId(),
      fakeGitHubToken(),
      fakeOpenAIKey(),
      fakeAnthropicKey(),
      fakeGoogleKey(),
      fakeSlackToken(),
      fakeJwt(),
      fakePem(),
      fakeDbUrl(),
      fakeEmail(),
      fakeIpv4(),
    ];
    for (const value of values) {
      expect(positive.some((item) => item.text.includes(value))).toBe(true);
    }
  });
});
