import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export type Build = 'chrome-mv3' | 'chrome-mv3-diagnostics';

export function buildPath(build: Build): string {
  return fileURLToPath(new URL(`../../.output/${build}`, import.meta.url));
}

interface ExtensionFixtures {
  /** Which built extension to load. Set per file with `test.use({ build })`. */
  build: Build;
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}

/** A fresh browser profile per test, with a built extension loaded. */
export const test = base.extend<ExtensionFixtures>({
  build: ['chrome-mv3', { option: true }],

  context: async ({ build }, use) => {
    const path = buildPath(build);
    const context = await chromium.launchPersistentContext('', {
      // The full Chromium build: its headless mode supports extensions.
      channel: 'chromium',
      args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
    });
    await use(context);
    await context.close();
  },

  serviceWorker: async ({ context }, use) => {
    const [existing] = context.serviceWorkers();
    await use(existing ?? (await context.waitForEvent('serviceworker')));
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export const expect = test.expect;
