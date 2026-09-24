import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fakeFixtureValues } from '../helpers/fake-secrets.js';

const fixtureDirectory = fileURLToPath(new URL('../fixtures/chatgpt/', import.meta.url));
const requestFiles = [
  'request.json',
  'request-long-multiline.json',
  'request-code-block.json',
  'request-follow-up.json',
  'request-regenerate.json',
];

/** @param {string} name */
async function readText(name) {
  return readFile(join(fixtureDirectory, name), 'utf8');
}

/** @param {string} name */
async function readJson(name) {
  return JSON.parse(await readText(name));
}

describe('synthetic ChatGPT fixtures', () => {
  it('uses the documented request envelope and text slots', async () => {
    for (const name of requestFiles) {
      const body = await readJson(name);
      expect(body.stream).toBe(true);
      expect(Array.isArray(body.messages)).toBe(true);
      for (const message of body.messages) {
        expect(Array.isArray(message.content?.parts)).toBe(true);
        for (const part of message.content.parts) expect(typeof part).toBe('string');
      }
    }
  });

  it('represents follow-up history and regeneration metadata', async () => {
    const followUp = await readJson('request-follow-up.json');
    expect(followUp.messages).toHaveLength(3);
    expect(followUp.messages[1].author.role).toBe('assistant');
    expect(followUp.parent_message_id).toBe('MESSAGE_ID_ASSISTANT_PREVIOUS');

    const regenerate = await readJson('request-regenerate.json');
    expect(regenerate.parent_message_id).toBe('MESSAGE_ID_ASSISTANT_REGENERATE');
  });

  it('contains delta and cumulative SSE samples ending in DONE', async () => {
    for (const name of ['stream-delta.sse', 'stream-cumulative.sse']) {
      const stream = await readText(name);
      expect(stream.endsWith('data: [DONE]\n\n')).toBe(true);
      const dataLines = stream
        .split('\n\n')
        .filter(Boolean)
        .map((event) => event.split('\n').find((line) => line.startsWith('data: ')));
      const expectedRecordCount = name === 'stream-delta.sse' ? 6 : 4;
      expect(dataLines).toHaveLength(expectedRecordCount);
      expect(dataLines.at(-1)).toBe('data: [DONE]');
      for (const line of dataLines.slice(0, -1)) JSON.parse(line.slice('data: '.length));
    }
  });

  it('uses only helper-generated synthetic values in request fixtures', async () => {
    const requestText = await Promise.all(requestFiles.map(readText));
    const combined = requestText.join('\n');
    expect(combined).toContain(fakeFixtureValues.stripeKey);
    expect(combined).toContain(fakeFixtureValues.dbUrl);
    expect(combined).toContain(fakeFixtureValues.clientName);
    expect(combined).not.toContain('sk_live_');
    expect(combined).not.toContain('Authorization');
    expect(combined).not.toContain('Cookie');
  });
});
