import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'dist');
const allowedUrlFragments = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://claude.ai/*',
  'http://localhost:4173/*',
];

/** @param {string} directory @returns {Promise<string[]>} */
async function filesIn(directory) {
  /** @type {string[]} */
  const files = [];
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...(await filesIn(path)));
    else files.push(path);
  }
  return files;
}

const files = await filesIn(dist);
const findings = [];
for (const file of files) {
  const extension = file.slice(file.lastIndexOf('.'));
  if (!['.js', '.html', '.json', '.css'].includes(extension)) continue;
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
    const value = match[0];
    if (!allowedUrlFragments.some((allowed) => value.startsWith(allowed))) {
      findings.push(`${relative(root, file)}: ${value}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Unexpected URL literals found in dist:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`verify:no-network passed (${files.length} built files checked).`);
}
