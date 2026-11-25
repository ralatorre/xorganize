import preact from '@preact/preset-vite';
import { defineConfig } from 'wxt';

/**
 * Applied to every extension page and to the background worker.
 *
 * `connect-src 'none'` means the browser itself refuses any network request
 * from extension code, so "nothing leaves the device" does not rest on the
 * code being well behaved. Only the extension's own packaged files can load.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  // Explicit imports only: every dependency of a file is visible in that file.
  imports: false,

  // Development happens inside a container, so WXT must not try to open a browser.
  webExt: { disabled: true },

  manifest: ({ browser, command }) => ({
    name: 'xorganize',
    description:
      'Tag, search and export your X bookmarks and likes. Everything stays on your device.',

    // Least privilege: one host and no API permissions. tests/e2e/manifest.spec.ts
    // fails if this grows, so any addition has to be deliberate. Keep the host
    // in sync with src/hosts.ts.
    host_permissions: ['https://x.com/*'],

    action: { default_title: 'Open xorganize library' },

    // The development server needs a looser policy for live reload.
    ...(command === 'build'
      ? { content_security_policy: { extension_pages: CONTENT_SECURITY_POLICY } }
      : {}),

    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              strict_min_version: '128.0',
              // The extension collects and transmits nothing.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : { minimum_chrome_version: '116' }),
  }),

  vite: () => ({
    plugins: [preact()],
  }),
});
