/** What the library page shows, read from the database in one go. */

import {
  DEFAULT_SETTINGS,
  activeAccount,
  countInBoth,
  counts,
  postsBySource,
  readSettings,
} from '@/src/db/repo';
import type { LibraryDatabase } from '@/src/db/schema';
import type { Counts, Settings, StoredPost } from '@/src/db/types';

/** Posts shown per source, newest first. */
export const POSTS_PER_SOURCE = 50;

export interface Snapshot {
  totals: Counts;
  /** Posts that are both bookmarked and liked, and so are counted in both totals. */
  inBoth: number;
  bookmarks: StoredPost[];
  likes: StoredPost[];
  settings: Settings;
}

export const EMPTY_SNAPSHOT: Snapshot = {
  totals: { bookmarks: 0, likes: 0 },
  inBoth: 0,
  bookmarks: [],
  likes: [],
  settings: DEFAULT_SETTINGS,
};

export async function loadSnapshot(
  db: LibraryDatabase,
  perSource = POSTS_PER_SOURCE,
): Promise<Snapshot> {
  const [account, settings] = await Promise.all([activeAccount(db), readSettings(db)]);
  if (account === undefined) return { ...EMPTY_SNAPSHOT, settings };
  const [totals, inBoth, bookmarks, likes] = await Promise.all([
    counts(db, account),
    countInBoth(db, account),
    postsBySource(db, account, 'bookmark', perSource),
    postsBySource(db, account, 'like', perSource),
  ]);
  return { totals, inBoth, bookmarks, likes, settings };
}

export function isEmpty(snapshot: Snapshot): boolean {
  return snapshot.totals.bookmarks + snapshot.totals.likes === 0;
}
