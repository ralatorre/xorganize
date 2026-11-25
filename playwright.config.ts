import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension from .output/chrome-mv3, so run
// `pnpm build` first. They never touch the real x.com: pages are served from
// fixtures by request interception, and the suite passes with no network.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
