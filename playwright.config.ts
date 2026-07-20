import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  webServer: {
    command: 'npm run dev -- --port 5188',
    url: 'http://localhost:5188',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: 'http://localhost:5188',
  },
});
