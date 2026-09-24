import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detect } from '../src/core/detect.js';
import { DEFAULT_CONFIG } from '../src/core/types.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const positive = JSON.parse(
  await readFile(join(root, 'test/fixtures/corpus/positive.json'), 'utf8'),
);
const clean = JSON.parse(await readFile(join(root, 'test/fixtures/corpus/clean.json'), 'utf8'));
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

const byRule = new Map();
for (const item of positive) {
  const found = detect(item.text, DEFAULT_CONFIG).some((detection) => detection.type === item.type);
  const current = byRule.get(item.type) ?? { hits: 0, total: 0 };
  current.total += 1;
  if (found) current.hits += 1;
  byRule.set(item.type, current);
}

const falsePositives = clean.filter((text) => detect(text, DEFAULT_CONFIG).length > 0);
const provider = positive.filter((item) => providerTypes.has(item.type));
const providerHits = provider.filter((item) =>
  detect(item.text, DEFAULT_CONFIG).some((detection) => detection.type === item.type),
).length;
const overallHits = positive.filter((item) =>
  detect(item.text, DEFAULT_CONFIG).some((detection) => detection.type === item.type),
).length;

console.log('Detection benchmark');
console.log(
  `Provider recall: ${((providerHits / provider.length) * 100).toFixed(2)}% (${providerHits}/${provider.length})`,
);
console.log(
  `Overall labelled recall: ${((overallHits / positive.length) * 100).toFixed(2)}% (${overallHits}/${positive.length})`,
);
console.log(
  `Clean false-positive rate: ${((falsePositives.length / clean.length) * 100).toFixed(2)}% (${falsePositives.length}/${clean.length})`,
);
for (const [type, result] of [...byRule.entries()].sort()) {
  console.log(
    `  ${type}: ${((result.hits / result.total) * 100).toFixed(2)}% (${result.hits}/${result.total})`,
  );
}

if (providerHits / provider.length < 0.95 || falsePositives.length / clean.length > 0.02) {
  process.exitCode = 1;
}
