import type { BrowserContext, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildPath, expect, test } from './fixtures';

/** SHA-256 of `web/InterVariable.woff2` in Inter 4.1, the official release, unmodified. */
const INTER_SHA256 = '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3';

const VIEWER = '9000000000000000001';
const DAY = Date.UTC(2026, 0, 2);

/** A stand-in for x.com that only has a background colour: X's Dim to start with. */
const STAND_IN_PAGE = `<!doctype html>
<html>
  <head><title>stand-in</title></head>
  <body style="background: rgb(21, 32, 43)"><main data-testid="primaryColumn"></main></body>
</html>`;

const serveStandIn = (context: BrowserContext) =>
  context.route('https://x.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: STAND_IN_PAGE }),
  );

/** One stored post, so that the library shows its list and settings. */
const RECORDS = {
  posts: [
    {
      accountId: VIEWER,
      id: '101',
      url: 'https://x.com/example_user/status/101',
      text: 'A saved post',
      createdAt: DAY,
      author: { handle: 'example_user', name: 'Example User' },
      media: [],
      links: [],
      sensitive: false,
      isBookmark: 1,
      isLike: 0,
      hasTags: 0,
      bookmarkSort: '101'.padStart(30, '0'),
      partial: false,
      unavailable: false,
      firstSeenAt: DAY,
      lastSeenAt: DAY,
      savedAt: DAY,
    },
  ],
  meta: [{ accountId: '', key: 'activeAccount', value: VIEWER }],
};

async function seed(page: Page) {
  await page.evaluate(
    (records) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('xorganize');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const names = Object.keys(records);
          const write = db.transaction(names, 'readwrite');
          for (const name of names) {
            for (const record of records[name as keyof typeof records]) {
              write.objectStore(name).put(record);
            }
          }
          write.oncomplete = () => {
            db.close();
            resolve();
          };
          write.onerror = () => reject(write.error);
        };
      }),
    RECORDS,
  );
  await page.reload();
  await expect(page.locator('.posts .post__text')).toHaveCount(1);
}

const theme = (page: Page) => page.locator('html');
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('matches the theme last seen on x.com, live, unless another is chosen', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const library = await context.newPage();
  await library.emulateMedia({ colorScheme: 'light' });
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(library.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();

  // Until x.com has been visited, Match X follows the system.
  await expect(theme(library)).toHaveAttribute('data-theme', 'light');

  const site = await context.newPage();
  await site.goto('https://x.com/home');
  await expect(theme(library)).toHaveAttribute('data-theme', 'dim');
  expect(await background(library)).toBe('rgb(21, 24, 30)');

  // X switches to its dark theme while the library is open. Like X's display
  // settings, this only restyles the body: nothing is added to the page.
  await site.evaluate(() => {
    document.body.style.background = 'rgb(0, 0, 0)';
  });
  await expect(theme(library)).toHaveAttribute('data-theme', 'dark');

  await seed(library);
  await expect(theme(library)).toHaveAttribute('data-theme', 'dark');
  const setting = library.getByRole('combobox', { name: /Theme/ });
  await expect(setting).toHaveValue('x');

  await setting.selectOption({ label: 'Light' });
  await expect(theme(library)).toHaveAttribute('data-theme', 'light');
  expect(await background(library)).toBe('rgb(255, 255, 255)');

  // System follows the system as it changes.
  await setting.selectOption({ label: 'System' });
  await library.emulateMedia({ colorScheme: 'dark' });
  await expect(theme(library)).toHaveAttribute('data-theme', 'dark');
  await library.emulateMedia({ colorScheme: 'light' });
  await expect(theme(library)).toHaveAttribute('data-theme', 'light');

  // The choice is kept.
  await setting.selectOption({ label: 'Dim' });
  await library.reload();
  await expect(theme(library)).toHaveAttribute('data-theme', 'dim');
  await expect(library.getByRole('combobox', { name: /Theme/ })).toHaveValue('dim');
});

test('draws its text in the packaged font, loaded from the extension itself', async ({
  context,
  extensionId,
}) => {
  const library = await context.newPage();
  const violations: string[] = [];
  library.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(library.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();

  const loaded = await library.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((font) => `${font.family} ${font.status}`);
  });
  expect(loaded).toEqual(['Inter loaded']);
  expect(violations).toEqual([]);

  // The packaged file is the official one, byte for byte.
  const packaged = await readFile(`${buildPath('chrome-mv3')}/fonts/InterVariable.woff2`);
  expect(createHash('sha256').update(packaged).digest('hex')).toBe(INTER_SHA256);
});
