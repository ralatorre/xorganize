/**
 * Fills the library with hand-written records, for browser tests that start
 * from a library rather than from captures on a stand-in x.com.
 */

import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export const VIEWER = '9000000000000000001';
export const DAY = Date.UTC(2026, 0, 2);

/** A stored post, bookmarked unless `fields` says otherwise. */
export const storedPost = (
  accountId: string,
  id: string,
  text: string,
  fields: Record<string, unknown> = {},
) => ({
  accountId,
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
  bookmarkSort: id.padStart(30, '0'),
  partial: false,
  unavailable: false,
  firstSeenAt: DAY,
  lastSeenAt: DAY,
  savedAt: DAY,
  ...fields,
});

export const storedTag = (id: string, name: string, accountId = VIEWER) => ({
  accountId,
  id,
  name,
  nameKey: name,
  color: 0,
  createdAt: DAY,
  lastUsedAt: DAY,
});

export type Records = Partial<Record<'posts' | 'tags' | 'postTags' | 'meta', unknown[]>>;

/** Opens the empty library, writes `records` past Dexie, and reloads until `posts` cards show. */
export async function openSeeded(page: Page, extensionId: string, records: Records, posts: number) {
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
            for (const record of records[name as keyof typeof records] ?? []) {
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
    records,
  );
  await page.reload();
  await expect(page.locator('.posts article')).toHaveCount(posts);
}
