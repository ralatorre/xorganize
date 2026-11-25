import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, extensionPath, test } from './fixtures';

// This test is the gate for least privilege. If it fails because the manifest
// grew, the new key or permission needs a reason written down in docs/SPEC.md
// before the expectation here is changed.

test('manifest requests the bare minimum', async () => {
  const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));

  expect(Object.keys(manifest).sort()).toEqual([
    'action',
    'background',
    'content_scripts',
    'content_security_policy',
    'description',
    'host_permissions',
    'manifest_version',
    'minimum_chrome_version',
    'name',
    'version',
  ]);

  expect(manifest.manifest_version).toBe(3);

  // One host, and no API permissions at all.
  expect(manifest.host_permissions).toEqual(['https://x.com/*']);
  expect(manifest.permissions).toBeUndefined();
  expect(manifest.optional_permissions).toBeUndefined();
  expect(manifest.optional_host_permissions).toBeUndefined();

  // Nothing a web page could load or message, so pages cannot probe for the extension.
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.externally_connectable).toBeUndefined();

  // Extension code can load only its own files and cannot make network requests.
  expect(manifest.content_security_policy).toEqual({
    extension_pages:
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; " +
      "font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; " +
      "frame-ancestors 'none'",
  });

  const scripts = manifest.content_scripts as Array<Record<string, unknown>>;
  expect(scripts).toHaveLength(2);
  for (const script of scripts) {
    expect(script.matches).toEqual(['https://x.com/*']);
    expect(script.run_at).toBe('document_start');
    expect(script.all_frames).toBeUndefined();
  }
  expect(scripts.filter((script) => script.world === 'MAIN')).toHaveLength(1);
});
