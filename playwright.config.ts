import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const chrome =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
  (existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);
export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4311',
    viewport: { width: 1600, height: 1050 },
    reducedMotion: 'reduce',
    launchOptions: { executablePath: chrome },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4311/api/state',
    env: { PORT: '4311', OPS_DATA_DIR: resolve('.data/browser-test') },
    reuseExistingServer: false,
  },
});
