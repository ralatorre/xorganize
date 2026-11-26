import { chromium, type Download, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { buildPath, expect, test } from './fixtures';

const VIEWER = '9000000000000000001';
const DAY = Date.UTC(2026, 0, 2);

/** A stored post, written as the database holds it. */
const stored = (id: string, text: string, changes: Record<string, unknown> = {}) => ({
  accountId: VIEWER,
  id,
  url: `https://x.com/example_user/status/${id}`,
  text,
  createdAt: DAY,
  author: { handle: 'example_user', name: 'Example User' },
  media: [],
  links: [],
  sensitive: false,
  isBookmark: 1,
  isLike: 0,
  hasTags: 0,
  bookmarkSort: id.padStart(30, '0'), // as the extension stores positions
  partial: false,
  unavailable: false,
  firstSeenAt: DAY,
  lastSeenAt: DAY,
  savedAt: DAY + Number(id),
  ...changes,
});

const tag = (id: string, name: string) => ({
  accountId: VIEWER,
  id,
  name,
  nameKey: name,
  color: 2,
  createdAt: DAY,
  lastUsedAt: DAY,
});

const LIBRARY = {
  posts: [
    stored('101', 'First bookmark', { hasTags: 1 }),
    stored('102', '=HYPERLINK("https://example.com")', { hasTags: 1 }),
    stored('103', 'Untagged bookmark'),
  ],
  tags: [tag('t-recipes', 'recipes'), tag('t-rust', 'rust'), tag('t-unused', 'unused')],
  postTags: [
    { accountId: VIEWER, postId: '101', tagId: 't-recipes', taggedAt: DAY },
    { accountId: VIEWER, postId: '102', tagId: 't-recipes', taggedAt: DAY },
    { accountId: VIEWER, postId: '102', tagId: 't-rust', taggedAt: DAY + 1 },
  ],
  meta: [{ accountId: '', key: 'activeAccount', value: VIEWER }],
};

/** Opens the library, writes the records straight into its database, and shows them. */
async function openLibrary(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
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
    LIBRARY,
  );
  await page.reload();
  await expect(page.locator('.posts .post__text')).toHaveCount(3);
}

async function download(page: Page, group: string, format: string): Promise<Download> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('group', { name: group }).getByRole('button', { name: format }).click(),
  ]);
  return file;
}

const contents = async (file: Download) => readFile((await file.path())!, 'utf8');

test('exports the view and the whole library, as JSON and CSV', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  await openLibrary(page, extensionId);

  // The view, as JSON: every post listed, marked as part of the library.
  const view = await download(page, 'Export view', 'JSON');
  expect(view.suggestedFilename()).toMatch(/^xorganize-export-\d{4}-\d{2}-\d{2}\.json$/);
  const viewJson = JSON.parse(await contents(view));
  expect(viewJson).toMatchObject({ format: 'xorganize', version: 1, scope: 'partial' });
  expect(viewJson.posts.map((post: { id: string }) => post.id)).toEqual(['103', '102', '101']);
  expect(viewJson.tags.map((exported: { name: string }) => exported.name).sort()).toEqual([
    'recipes',
    'rust',
  ]);
  await expect(page.getByRole('group', { name: 'Export view' })).toContainText('Exported 3 posts');

  // One tag, as CSV: named after it, with formulas neutralised.
  await page
    .getByRole('region', { name: 'Tags' })
    .getByRole('button', { name: /^recipes 2$/ })
    .click();
  await expect(page.locator('.posts .post__text')).toHaveCount(2);
  const recipes = await download(page, 'Export view', 'CSV');
  expect(recipes.suggestedFilename()).toMatch(/^xorganize-export-recipes-\d{4}-\d{2}-\d{2}\.csv$/);
  const rows = (await contents(recipes)).split('\r\n');
  expect(rows[0]).toBe(
    '\uFEFFpost_id,url,author_handle,author_name,posted_at,saved_at,sources,tags,text,media_urls',
  );
  expect(rows).toHaveLength(4); // header, two posts, and the final line end
  expect(rows[1]).toContain(`,bookmark,recipes;rust,"'=HYPERLINK(""https://example.com"")",`);

  // The whole library, from Settings: a full backup, unused tags included.
  const backup = await download(page, 'Export library', 'JSON backup');
  expect(backup.suggestedFilename()).toMatch(/^xorganize-export-\d{4}-\d{2}-\d{2}\.json$/);
  const backupJson = JSON.parse(await contents(backup));
  expect(backupJson).not.toHaveProperty('scope');
  expect(backupJson.accountId).toBe(VIEWER);
  expect(backupJson.posts).toHaveLength(3);
  expect(backupJson.tags).toHaveLength(3);
  expect(backupJson.postTags).toHaveLength(3);
  expect(JSON.stringify(backupJson)).not.toContain('accountId":"' + VIEWER + '","id');

  expect(violations).toEqual([]);
});

/** Picks a file for an import control, then waits for its preview or its answer. */
async function pick(page: Page, button: string, path: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: button }).click(),
  ]);
  await chooser.setFiles(path);
}

/** A library export's records, less what an import resets. */
const records = (text: string) => {
  const { posts, tags, postTags } = JSON.parse(text) as {
    posts: Array<Record<string, unknown>>;
    tags: unknown[];
    postTags: unknown[];
  };
  const unseen = (post: Record<string, unknown>) => {
    const copy = { ...post };
    delete copy.lastSeenAt;
    return copy;
  };
  return { posts: posts.map(unseen), tags, postTags };
};

test('a backup restores the library in a clean profile', async ({ context, extensionId }, info) => {
  const page = await context.newPage();
  await openLibrary(page, extensionId);
  const backupPath = info.outputPath('backup.json');
  const original = await contents(await download(page, 'Export library', 'JSON backup'));
  await writeFile(backupPath, original);
  const viewPath = info.outputPath('view.json');
  await (await download(page, 'Export view', 'JSON')).saveAs(viewPath);
  const csvPath = info.outputPath('library.csv');
  await (await download(page, 'Export library', 'CSV')).saveAs(csvPath);

  // Another browser profile, with nothing in it.
  const path = buildPath('chrome-mv3');
  const clean = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
  });
  try {
    const worker = clean.serviceWorkers()[0] ?? (await clean.waitForEvent('serviceworker'));
    const restored = await clean.newPage();
    const violations: string[] = [];
    restored.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) violations.push(message.text());
    });
    await restored.goto(`chrome-extension://${new URL(worker.url()).host}/library.html`);
    await expect(restored.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();

    // A CSV file is refused, with what to do instead.
    await pick(restored, 'Restore from a backup', csvPath);
    await expect(restored.getByRole('status')).toHaveText(/This is not a JSON backup/);

    // The backup: previewed, then merged into the empty library.
    await pick(restored, 'Restore from a backup', backupPath);
    const preview = restored.getByRole('dialog', { name: 'Import this backup?' });
    await expect(preview).toContainText('3 posts, 3 tags and 3 tag assignments');
    await expect(preview.getByRole('button', { name: 'Merge' })).toBeFocused();
    await expect(preview.getByRole('button', { name: 'Replace' })).toBeVisible();
    await preview.getByRole('button', { name: 'Merge' }).click();
    await expect(preview).toBeHidden();
    await expect(restored.locator('.posts .post__text')).toHaveCount(3);
    await expect(
      restored.getByRole('region', { name: 'Tags' }).getByRole('button', { name: /^recipes 2$/ }),
    ).toBeVisible();
    await expect(restored.getByRole('group', { name: 'Export library' })).toBeVisible();

    // What it exports again is what was backed up.
    const again = await contents(await download(restored, 'Export library', 'JSON backup'));
    expect(records(again)).toEqual(records(original));

    // A view's file can be merged, never used to replace the library.
    await pick(restored, 'Import backup', viewPath);
    await expect(preview).toContainText('only be merged');
    await expect(preview.getByRole('button', { name: 'Replace' })).toHaveCount(0);
    await preview.getByRole('button', { name: 'Cancel' }).click();
    await expect(preview).toBeHidden();

    // Replace, with the full backup, leaves the same library.
    await pick(restored, 'Import backup', backupPath);
    await expect(preview).toContainText('deletes');
    await preview.getByRole('button', { name: 'Replace' }).click();
    await expect(preview).toBeHidden();
    await expect(restored.getByText('Imported 3 posts and 3 tags')).toBeVisible();
    await expect(restored.locator('.posts .post__text')).toHaveCount(3);

    expect(violations).toEqual([]);
  } finally {
    await clean.close();
  }
});
