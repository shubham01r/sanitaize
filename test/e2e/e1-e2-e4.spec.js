import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { test as base, expect } from 'playwright/test';
import { fakeClientName, fakeStripeKey } from '../helpers/fake-secrets.js';

const extensionPath = resolve('dist');
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), 'sanitaize-e2e-'));
    const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
    const options = {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
      ],
      ...(executablePath ? { executablePath } : {}),
    };
    const context = await chromium.launchPersistentContext(userDataDir, options);
    try {
      await use(context);
    } finally {
      for (const page of context.pages()) {
        await page.close({ runBeforeUnload: false, timeout: 1_000 }).catch(() => {});
      }
      const browser = context.browser();
      if (browser) await browser.close().catch(() => {});
      else await context.close().catch(() => {});
      await rm(userDataDir, { recursive: true, force: true });
    }
  },
});

async function openMockChat(page, path = '/') {
  await page.goto(path);
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.szMain === 'ready' &&
      document.documentElement.dataset.szIso === 'ready' &&
      document.documentElement.dataset.szReady === 'ready',
  );
}

async function openWithoutConfig(page, path = '/') {
  await page.goto(path);
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.szMain === 'ready' &&
      document.documentElement.dataset.szIso === 'ready',
  );
}

async function openMockClaude(page) {
  await page.goto('/claude');
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.szMain === 'ready' &&
      document.documentElement.dataset.szIso === 'ready' &&
      document.documentElement.dataset.szReady === 'ready',
  );
}

async function sendPrompt(page, text) {
  await page.locator('#prompt-textarea').fill(text);
  await page.locator('#send-button').click();
}

async function recordedRequests(request) {
  const response = await request.get('/__test/state');
  expect(response.ok()).toBe(true);
  return (await response.json()).requests;
}

function promptWithSecret() {
  return `Debug ${fakeClientName()} with ${fakeStripeKey()}`;
}

test.describe('T2.6 local ChatGPT E2E', () => {
  test.beforeEach(async ({ request }) => {
    const response = await request.post('/__test/reset');
    expect(response.ok()).toBe(true);
  });

  test('E1: sends a format-valid mock instead of the real synthetic key', async ({
    page,
    request,
  }) => {
    await openMockChat(page);
    const real = fakeStripeKey();
    await sendPrompt(page, promptWithSecret());

    await expect.poll(async () => (await recordedRequests(request)).length).toBe(1);
    const [entry] = await recordedRequests(request);
    const serialized = JSON.stringify(entry.body);
    const mock = serialized.match(/sk_test_[A-Za-z0-9]+/)?.[0];
    expect(serialized).not.toContain(real);
    expect(mock).toBeTruthy();
    expect(mock).toHaveLength(real.length);
  });

  test('E2: rehydrates a mock split across SSE events in the page DOM', async ({ page }) => {
    await openMockChat(page);
    const real = fakeStripeKey();
    await sendPrompt(page, `The key is ${real}`);

    const reply = page.locator('#reply');
    await expect(reply).toContainText(real);
    await expect(reply).not.toContainText('sk_test_mock');
    await expect(reply).not.toContainText('st_mock');
  });

  test('E4: reuses the same mock for a second request in the same tab', async ({
    page,
    request,
  }) => {
    await openMockChat(page);
    const real = fakeStripeKey();
    const prompt = `Use ${real} twice`;
    await sendPrompt(page, prompt);
    await expect.poll(async () => (await recordedRequests(request)).length).toBe(1);
    await sendPrompt(page, prompt);
    await expect.poll(async () => (await recordedRequests(request)).length).toBe(2);

    const entries = await recordedRequests(request);
    const mocks = entries.map(
      (entry) => JSON.stringify(entry.body).match(/sk_test_[A-Za-z0-9]+/)?.[0],
    );
    expect(mocks[0]).toBeTruthy();
    expect(mocks[1]).toBe(mocks[0]);
    expect(JSON.stringify(entries)).not.toContain(real);
  });

  test('E6: sanitizes a renamed unknown-shape body and reports compatibility', async ({
    page,
    request,
  }) => {
    await openMockChat(page, '/?renamed=1');
    const real = fakeStripeKey();
    await sendPrompt(page, `Renamed shape ${real}`);
    await expect.poll(async () => (await recordedRequests(request)).length).toBe(1);
    const [entry] = await recordedRequests(request);
    expect(JSON.stringify(entry.body)).not.toContain(real);
    await expect(page.locator('html')).toHaveAttribute('data-sz-warning', 'W_ADAPTER_UNKNOWN_SHAPE');
  });

  test('E7: blocks a request when configuration is delayed beyond the timeout', async ({
    page,
    request,
  }) => {
    await openWithoutConfig(page, '/?szConfigDelayMs=2500');
    await sendPrompt(page, `Delayed config ${fakeStripeKey()}`);
    await expect(page.locator('html')).toHaveAttribute('data-sz-state', 'blocked', { timeout: 10_000 });
    expect(await recordedRequests(request)).toHaveLength(0);
  });

  test('E8: keeps the chat usable when the response stream is malformed', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openMockChat(page, '/?streamMode=malformed');
    const real = fakeStripeKey();
    await sendPrompt(page, `Malformed stream ${real}`);
    await expect(page.locator('#reply')).toContainText('Reply uses');
    const replyText = (await page.locator('#reply').textContent()) ?? '';
    expect(replyText.includes(real) || replyText.includes('sk_test_mock')).toBe(true);
    expect(replyText).not.toContain('not-json');
    expect(pageErrors).toEqual([]);
  });

  test('E11: protects a Claude-shaped completion request and response', async ({
    page,
    request,
  }) => {
    await openMockClaude(page);
    const real = fakeStripeKey();
    await sendPrompt(page, `Claude debug ${real}`);
    await expect.poll(async () => (await recordedRequests(request)).length).toBe(1);
    const [entry] = await recordedRequests(request);
    const serialized = JSON.stringify(entry.body);
    expect(serialized).not.toContain(real);
    expect(serialized).toContain('sk_test_');
    await expect(page.locator('#reply')).toContainText(real);
  });
});
