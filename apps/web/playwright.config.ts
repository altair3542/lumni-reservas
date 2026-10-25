import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
if (!process.env.E2E_BASE_URL)
  throw new Error('E2E_BASE_URL es obligatorio; usa una demo aislada para pruebas.');
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  outputDir: process.env.E2E_OUTPUT_DIR ?? join(tmpdir(), 'lumni-reservas-e2e'),
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    timezoneId: 'Pacific/Auckland',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'off',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
});
