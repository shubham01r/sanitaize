import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fakeAnthropicKey,
  fakeAwsKeyId,
  fakeAwsSecretKey,
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
} from '../test/helpers/fake-secrets.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const output = join(root, 'test', 'fixtures', 'corpus');

const positive = [
  { type: 'STRIPE_KEY', text: `Synthetic Stripe credential ${fakeStripeKey()}` },
  { type: 'STRIPE_KEY', text: `const stripe = "${fakeStripeKey()}";` },
  { type: 'STRIPE_KEY', text: `Refund path uses ${fakeStripeKey()} in this synthetic test.` },
  { type: 'AWS_ACCESS_KEY_ID', text: `AWS synthetic id ${fakeAwsKeyId()}` },
  { type: 'AWS_ACCESS_KEY_ID', text: `const accessKeyId = "${fakeAwsKeyId()}";` },
  { type: 'AWS_ACCESS_KEY_ID', text: `Debug the synthetic AWS value ${fakeAwsKeyId()}.` },
  { type: 'AWS_SECRET_KEY', text: `aws_secret_key = "${fakeAwsSecretKey()}"` },
  { type: 'AWS_SECRET_KEY', text: `AWS_SECRET_ACCESS_KEY: ${fakeAwsSecretKey()}` },
  { type: 'GITHUB_TOKEN', text: `Synthetic GitHub token ${fakeGitHubToken()}` },
  { type: 'GITHUB_TOKEN', text: `const token = "${fakeFineGrainedToken()}";` },
  { type: 'GITHUB_TOKEN', text: `Use ${fakeGitHubToken()} for a local-only fixture.` },
  { type: 'OPENAI_KEY', text: `Synthetic OpenAI key ${fakeOpenAIKey()}` },
  { type: 'OPENAI_KEY', text: `const apiKey = "${fakeOpenAIKey()}";` },
  { type: 'OPENAI_KEY', text: `The synthetic project key is ${fakeOpenAIKey()}.` },
  { type: 'ANTHROPIC_KEY', text: `Synthetic Anthropic key ${fakeAnthropicKey()}` },
  { type: 'ANTHROPIC_KEY', text: `const apiKey = "${fakeAnthropicKey()}";` },
  { type: 'ANTHROPIC_KEY', text: `Review ${fakeAnthropicKey()} in the fixture.` },
  { type: 'GOOGLE_API_KEY', text: `Synthetic Google key ${fakeGoogleKey()}` },
  { type: 'GOOGLE_API_KEY', text: `const googleKey = "${fakeGoogleKey()}";` },
  { type: 'GOOGLE_API_KEY', text: `Use ${fakeGoogleKey()} in a local test.` },
  { type: 'SLACK_TOKEN', text: `Synthetic Slack token ${fakeSlackToken()}` },
  { type: 'SLACK_TOKEN', text: `const slackToken = "${fakeSlackToken()}";` },
  { type: 'SLACK_TOKEN', text: `The fixture contains ${fakeSlackToken()} only.` },
  { type: 'JWT', text: `Synthetic JWT ${fakeJwt()}` },
  { type: 'JWT', text: `const jwt = "${fakeJwt()}";` },
  { type: 'JWT', text: `Validate the synthetic token ${fakeJwt()}.` },
  { type: 'PEM_PRIVATE_KEY', text: fakePem() },
  { type: 'DB_URL', text: `Synthetic database ${fakeDbUrl()}` },
  { type: 'DB_URL', text: `DATABASE_URL=${fakeDbUrl()}` },
  { type: 'EMAIL', text: `Synthetic contact ${fakeEmail()}` },
  { type: 'IPV4', text: `Synthetic private address ${fakeIpv4()}` },
  { type: 'INTERNAL_HOST', text: `Synthetic service host ${fakeInternalHost()}` },
  { type: 'GENERIC_SECRET', text: `token = "${fakeGenericSecret()}"` },
  { type: 'GENERIC_SECRET', text: `password: ${fakeGenericSecret()}` },
];

const cleanTemplates = [
  'const total = items.reduce((sum, item) => sum + item.price, 0);',
  'export function formatLabel(value) { return value.trim(); }',
  'if (response.status === 200) { return response.json(); }',
  'const colors = ["red", "green", "blue"];',
  'class UserRepository { findById(id) { return this.users.get(id); } }',
  'function isEmpty(value) { return value === null || value === undefined; }',
  'const result = await Promise.all(requests.map((request) => request()));',
  'return { ...state, loading: false };',
  'const sorted = [...values].sort((a, b) => a.localeCompare(b));',
  'console.log("Application started");',
  'const query = new URLSearchParams({ page: "1", limit: "20" });',
  'function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }',
  'const cache = new Map();',
  'if (!input) throw new Error("Missing input");',
  'export const VERSION = "1.0.0";',
  'const nested = { outer: { inner: true } };',
  'function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }',
  'const unique = [...new Set(inputValues)];',
  'return list.filter((item) => item.enabled);',
  'const message = `Processed ${count} records`;',
  'switch (status) { case "ready": return true; default: return false; }',
  'const date = new Date().toISOString();',
  'function debounce(callback, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), wait); }; }',
  'const headers = { Accept: "application/json" };',
  'export default function reducer(state = initialState, action) { return state; }',
  'const path = `${directory}/${filename}`;',
  'if (Array.isArray(values) && values.length > 0) { process(values); }',
  'const result = Object.fromEntries(entries);',
  'function noop() {}',
  'return value ?? fallback;',
  'const text = String(value).trim();',
];

const clean = Array.from({ length: 500 }, (_, index) => {
  const template = cleanTemplates[index % cleanTemplates.length];
  return `${template} // synthetic clean sample ${index + 1}`;
});

await mkdir(output, { recursive: true });
await writeFile(join(output, 'positive.json'), `${JSON.stringify(positive, null, 2)}\n`, 'utf8');
await writeFile(join(output, 'clean.json'), `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
console.log(`Generated ${positive.length} positive and ${clean.length} clean corpus entries.`);
