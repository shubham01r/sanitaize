import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  webServer: {
    command: 'node test/e2e/mock-server/server.mjs',
    url: 'http://localhost:4173/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
