/**
 * Every read and write of the library goes through here.
 */

import Dexie, { type Table } from 'dexie';
import type { CapturedPost } from '@/src/capture/normalise';
import type { SourceKind } from '@/src/capture/operations';
import { isTheme, type Theme } from '@/src/dom/theme';
import { isHandle, isRecord } from '@/src/guards';
import { isXAvatarUrl } from '@/src/hosts';
import type { LibraryDatabase } from './schema';
import type {
  AccountId,
  AccountProfile,
  BackupTimes,
  Counts,
  PostId,
  PostTag,
  Settings,
  StoredAccount,
  StoredPost,
  ThemeSetting,
} from './types';

export interface CaptureBatch {
  accountId: AccountId;
  /** The timeline the posts came from, or the change the user just made. */
  source?: SourceKind;
  /** Posts that belong to `source`, with their position in it when known. */
  items: Array<{ post: CapturedPost; sortIndex?: string; partial?: boolean }>;
  /** Posts that other posts refer to: kept so those can be shown in full. */
  referenced: CapturedPost[];
  /** Posts that X reports as no longer available. */
  unavailable: PostId[];
}

const ACTIVE_ACCOUNT = 'activeAccount';
const SETTINGS = 'settings';
const LAST_BACKUP = 'lastBackupAt';
const REMINDER_DISMISSED = 'backupReminderDismissedAt';
const X_THEME = 'xTheme';
const PROFILE = 'profile';

/** How often the backup reminder can be set to come back, in days. 0 turns it off. */
export const BACKUP_REMINDER_DAYS = [7, 30, 90, 0] as const;

/** The library's theme choices, in the order Settings offers them. */
export const THEME_SETTINGS: readonly ThemeSetting[] = ['x', 'system', 'light', 'dim', 'dark'];

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  remoteImages: true,
  backupReminderDays: 30,
  theme: 'x',
  promptAfterBookmark: true,
  promptAfterLike: false,
};

/** Whether to offer tags for a post just added to a source on X (DESIGN, 4.3). */
export function prompts(settings: Settings, source: SourceKind): boolean {
  return source === 'bookmark' ? settings.promptAfterBookmark : settings.promptAfterLike;
}

/** The settings change that turns the prompt after a bookmark or a like on or off. */
export function promptChange(source: SourceKind, enabled: boolean): Partial<Settings> {
  return source === 'bookmark' ? { promptAfterBookmark: enabled } : { promptAfterLike: enabled };
}

const SORT_WIDTH = 30;

/**
 * Strings that sort the way positions in a bookmarks or likes list do. Three
 * kinds, which sort in this order, highest first:
 *
 * 1. `recentKey`: the user bookmarked or liked the post just now. It belongs
 *    at the top, newest first, until the timeline supplies its real position.
 * 2. `sortKey`: the real position from the timeline, padded to a fixed width
 *    so that string order matches numeric order.
 * 3. `unknownKey`: the post is known to be bookmarked or liked only because
 *    the API said so when it appeared somewhere else. When that happened is
 *    not known, so it goes below everything with a real position, ordered by
 *    the post's own date.
 */
export function sortKey(sortIndex: string): string {
  return sortIndex.padStart(SORT_WIDTH, '0');
}

export function recentKey(now: number): string {
  return `~${String(now).padStart(SORT_WIDTH - 1, '0')}`; // `~` sorts above every digit
}

export function unknownKey(createdAt: number | null): string {
  return `!${String(Math.max(0, createdAt ?? 0)).padStart(SORT_WIDTH - 1, '0')}`; // `!` sorts below
}

export interface MergeContext {
  accountId: AccountId;
  source?: SourceKind;
  sortIndex?: string;
  /** The post was read from the page, not the API, and holds only the basics. */
  partial?: boolean;
  now: number;
}

/**
 * Combines a freshly captured post with the stored copy, if there is one.
 *
 * - Content comes from the new capture, which is the more recent.
 * - A source is set by the timeline or change the post arrived through, and
 *   otherwise follows the account's own state as the API reports it.
 * - A partial capture never replaces the content of a full one.
 * - Timestamps of first sight and of entering the library never move forward.
 * - Tags and their flag are left alone.
 */
export function mergePost(
  existing: StoredPost | undefined,
  captured: CapturedPost,
  context: MergeContext,
): StoredPost {
  const { bookmarked, liked, ...fresh } = captured;
  const { now } = context;

  const keepStored = context.partial === true && existing !== undefined && !existing.partial;
  const content = keepStored ? contentOf(existing) : fresh;

  const flag = (source: SourceKind, reported: boolean | undefined, stored: 0 | 1): 0 | 1 => {
    if (context.source === source) return 1;
    if (reported !== undefined) return reported ? 1 : 0;
    return stored;
  };
  const isBookmark = flag('bookmark', bookmarked, existing?.isBookmark ?? 0);
  const isLike = flag('like', liked, existing?.isLike ?? 0);

  const sort = (source: SourceKind, set: 0 | 1, stored: string | undefined) => {
    if (!set) return undefined;
    if (context.source === source) {
      // From the timeline: its real position. From a change just made: the top.
      return context.sortIndex !== undefined
        ? sortKey(context.sortIndex)
        : (stored ?? recentKey(now));
    }
    // Known only from the API's say-so on a post seen elsewhere.
    return stored ?? unknownKey(content.createdAt);
  };
  const bookmarkSort = sort('bookmark', isBookmark, existing?.bookmarkSort);
  const likeSort = sort('like', isLike, existing?.likeSort);
  const unbookmarkedAt = lostAt(existing?.isBookmark, isBookmark, existing?.unbookmarkedAt, now);
  const unlikedAt = lostAt(existing?.isLike, isLike, existing?.unlikedAt, now);

  return {
    accountId: context.accountId,
    ...content,
    isBookmark,
    isLike,
    hasTags: existing?.hasTags ?? 0,
    ...(bookmarkSort !== undefined ? { bookmarkSort } : {}),
    ...(likeSort !== undefined ? { likeSort } : {}),
    ...(unbookmarkedAt !== undefined ? { unbookmarkedAt } : {}),
    ...(unlikedAt !== undefined ? { unlikedAt } : {}),
    partial: context.partial === true && !keepStored,
    unavailable: false,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    savedAt: existing?.savedAt ?? now,
  };
}

/**
 * When a post left a source: now, if it was in it and is no longer; the time
 * already recorded, if it was already out; nothing while it is in it.
 */
export function lostAt(
  was: 0 | 1 | undefined,
  is: 0 | 1,
  recorded: number | undefined,
  now: number,
): number | undefined {
  if (is) return undefined;
  return was ? now : recorded;
}

/** The fields of a stored post that describe the post itself. */
function contentOf(post: StoredPost): Omit<CapturedPost, 'bookmarked' | 'liked'> {
  return {
    id: post.id,
    url: post.url,
    text: post.text,
    createdAt: post.createdAt,
    ...(post.lang !== undefined ? { lang: post.lang } : {}),
    author: post.author,
    media: post.media,
    links: post.links,
    ...(post.quotedId !== undefined ? { quotedId: post.quotedId } : {}),
    sensitive: post.sensitive,
  };
}

/** Stores a batch of captured posts and returns the account's new totals. */
export async function saveCapture(
  db: LibraryDatabase,
  batch: CaptureBatch,
  now = Date.now(),
): Promise<Counts> {
  const { accountId } = batch;
  return db.transaction('rw', db.posts, db.meta, async () => {
    const save = async (post: CapturedPost, context: Partial<MergeContext> = {}) => {
      const existing = await db.posts.get([accountId, post.id]);
      await db.posts.put(mergePost(existing, post, { ...context, accountId, now }));
    };

    // Referenced posts first, so a post that is both referenced and an item
    // ends up with the item's source.
    for (const post of batch.referenced) await save(post);
    for (const { post, sortIndex, partial } of batch.items) {
      await save(post, { source: batch.source, sortIndex, partial });
    }

    for (const id of batch.unavailable) {
      await db.posts.update([accountId, id], { unavailable: true, lastSeenAt: now });
    }

    await rememberAccount(db, accountId);
    return counts(db, accountId);
  });
}

/**
 * Records that a post is no longer bookmarked or liked. A post left with no
 * source and no tags has no reason to stay, and is removed.
 */
export async function clearSource(
  db: LibraryDatabase,
  accountId: AccountId,
  postId: PostId,
  source: SourceKind,
  now = Date.now(),
): Promise<Counts> {
  return db.transaction('rw', db.posts, async () => {
    const post = await db.posts.get([accountId, postId]);
    if (post) {
      // A post cleared from a source it was not in keeps what it had.
      if (source === 'bookmark' && post.isBookmark) {
        post.unbookmarkedAt = now;
        post.isBookmark = 0;
        delete post.bookmarkSort;
      } else if (source === 'like' && post.isLike) {
        post.unlikedAt = now;
        post.isLike = 0;
        delete post.likeSort;
      }
      if (post.isBookmark || post.isLike || post.hasTags) await db.posts.put(post);
      else await db.posts.delete([accountId, postId]);
    }
    return counts(db, accountId);
  });
}

/** What `removePost` took out, so that it can be put back. */
export interface RemovedPost {
  post: StoredPost;
  postTags: PostTag[];
}

/**
 * Takes a post out of the library, with its tags, and returns what it took,
 * or undefined if the post was not there. If it is still bookmarked or liked
 * on X, it comes back the next time that timeline is loaded.
 */
export async function removePost(
  db: LibraryDatabase,
  accountId: AccountId,
  postId: PostId,
): Promise<RemovedPost | undefined> {
  return db.transaction('rw', db.posts, db.postTags, async () => {
    const post = await db.posts.get([accountId, postId]);
    if (!post) return undefined;
    const assigned = db.postTags.where('[accountId+postId]').equals([accountId, postId]);
    const postTags = await assigned.toArray();
    await assigned.delete();
    await db.posts.delete([accountId, postId]);
    return { post, postTags };
  });
}

/**
 * Undoes `removePost` (DESIGN, 8, decision 10): the post and its tags come
 * back as they were, in one transaction. A tag deleted in the meantime is
 * left out. If the post was stored again meanwhile, from X, that copy is kept.
 */
export async function restorePost(db: LibraryDatabase, removed: RemovedPost): Promise<void> {
  const { post, postTags } = removed;
  const { accountId } = post;
  await db.transaction('rw', db.posts, db.tags, db.postTags, async () => {
    const [existing, tags] = await Promise.all([
      db.posts.get([accountId, post.id]),
      db.tags.bulkGet(postTags.map(({ tagId }): [AccountId, string] => [accountId, tagId])),
    ]);
    const kept = postTags.filter((_, index) => tags[index] !== undefined);
    await db.postTags.bulkPut(kept);
    const base = existing ?? post;
    await db.posts.put({ ...base, hasTags: kept.length > 0 || existing?.hasTags === 1 ? 1 : 0 });
  });
}

const allOf = (accountId: AccountId) =>
  [
    [accountId, Dexie.minKey],
    [accountId, Dexie.maxKey],
  ] as const;
const flaggedOf = (accountId: AccountId) =>
  [
    [accountId, 1, Dexie.minKey],
    [accountId, 1, Dexie.maxKey],
  ] as const;
const idsOf = (keys: Array<[AccountId, PostId]>): PostId[] => keys.map(([, id]) => id);

export async function counts(db: LibraryDatabase, accountId: AccountId): Promise<Counts> {
  const count = (index: string) =>
    db.posts
      .where(index)
      .between(...flaggedOf(accountId))
      .count();
  const [bookmarks, likes] = await Promise.all([
    count('[accountId+isBookmark+bookmarkSort]'),
    count('[accountId+isLike+likeSort]'),
  ]);
  return { bookmarks, likes };
}

/** The IDs of a source's posts in timeline order, newest first. */
export async function sourceIds(
  db: LibraryDatabase,
  accountId: AccountId,
  source: SourceKind,
): Promise<PostId[]> {
  const index =
    source === 'bookmark' ? '[accountId+isBookmark+bookmarkSort]' : '[accountId+isLike+likeSort]';
  return idsOf(
    await db.posts
      .where(index)
      .between(...flaggedOf(accountId))
      .reverse()
      .primaryKeys(),
  );
}

/** The IDs of posts with at least one tag. */
export async function taggedIds(db: LibraryDatabase, accountId: AccountId): Promise<PostId[]> {
  return idsOf(
    await db.posts
      .where('[accountId+hasTags+savedAt]')
      .between(...flaggedOf(accountId))
      .primaryKeys(),
  );
}

/** The IDs of every stored post, newest in the library first. */
export async function savedIds(db: LibraryDatabase, accountId: AccountId): Promise<PostId[]> {
  return idsOf(
    await db.posts
      .where('[accountId+savedAt]')
      .between(...allOf(accountId))
      .reverse()
      .primaryKeys(),
  );
}

/** Every stored post's ID with its author's handle, read from the index alone. */
export async function authorsOf(
  db: LibraryDatabase,
  accountId: AccountId,
): Promise<Array<{ id: PostId; handle: string }>> {
  const range = () => db.posts.where('[accountId+author.handle]').between(...allOf(accountId));
  return db.transaction('r', db.posts, async () => {
    const [keys, ids] = await Promise.all([range().keys(), range().primaryKeys()]);
    return ids.map(([, id], index) => ({
      id,
      handle: String((keys[index] as [AccountId, string] | undefined)?.[1] ?? ''),
    }));
  });
}

/**
 * Up to `limit` of the account's posts with IDs after `afterId`, in ID order.
 * Search reads the library a page at a time this way, so that no one read
 * holds every post.
 */
export function postsAfter(
  db: LibraryDatabase,
  accountId: AccountId,
  afterId: PostId,
  limit: number,
): Promise<StoredPost[]> {
  return db.posts
    .where('[accountId+id]')
    .between([accountId, afterId], [accountId, Dexie.maxKey], false, true)
    .limit(limit)
    .toArray();
}

export interface PostChanges {
  /** Every stored post's ID, so that removed posts can be told apart. */
  ids: PostId[];
  /** The posts stored from X at or after the given time. */
  changed: StoredPost[];
}

/** What search needs to catch up: which posts exist, and which were stored since `since`. */
export function postChanges(
  db: LibraryDatabase,
  accountId: AccountId,
  since: number,
): Promise<PostChanges> {
  return db.transaction('r', db.posts, async () => {
    const [keys, changed] = await Promise.all([
      db.posts
        .where('[accountId+id]')
        .between(...allOf(accountId))
        .primaryKeys(),
      db.posts
        .where('[accountId+lastSeenAt]')
        .between([accountId, since], [accountId, Dexie.maxKey])
        .toArray(),
    ]);
    return { ids: idsOf(keys), changed };
  });
}

/**
 * Records the account whose library the page shows. Called inside any write
 * that stores a post, which must include the `meta` table.
 */
export function rememberAccount(db: LibraryDatabase, accountId: AccountId): Promise<unknown> {
  return db.meta.put({ accountId: '', key: ACTIVE_ACCOUNT, value: accountId });
}

/**
 * Shows an account's library, as if it had just stored something. Only an
 * account that holds something here can be chosen.
 */
export function chooseAccount(db: LibraryDatabase, accountId: AccountId): Promise<boolean> {
  return db.transaction('rw', db.posts, db.tags, db.meta, async () => {
    const [post, tag] = await Promise.all([
      db.posts
        .where(':id')
        .between(...allOf(accountId))
        .limit(1)
        .primaryKeys(),
      db.tags
        .where(':id')
        .between(...allOf(accountId))
        .limit(1)
        .primaryKeys(),
    ]);
    if (post.length + tag.length === 0) return false;
    await rememberAccount(db, accountId);
    return true;
  });
}

/** The account that most recently stored something, if any has. */
export async function activeAccount(db: LibraryDatabase): Promise<AccountId | undefined> {
  const row = await db.meta.get(['', ACTIVE_ACCOUNT]);
  return typeof row?.value === 'string' ? row.value : undefined;
}

/** The settings, with defaults for anything missing or not of the expected type. */
export async function readSettings(db: LibraryDatabase): Promise<Settings> {
  const row = await db.meta.get(['', SETTINGS]);
  const stored = typeof row?.value === 'object' && row.value !== null ? row.value : {};
  const { remoteImages, backupReminderDays, theme, promptAfterBookmark, promptAfterLike } =
    stored as Partial<Record<keyof Settings, unknown>>;
  const flag = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;
  return {
    remoteImages: flag(remoteImages, DEFAULT_SETTINGS.remoteImages),
    backupReminderDays: (BACKUP_REMINDER_DAYS as readonly unknown[]).includes(backupReminderDays)
      ? (backupReminderDays as number)
      : DEFAULT_SETTINGS.backupReminderDays,
    theme: (THEME_SETTINGS as readonly unknown[]).includes(theme)
      ? (theme as ThemeSetting)
      : DEFAULT_SETTINGS.theme,
    promptAfterBookmark: flag(promptAfterBookmark, DEFAULT_SETTINGS.promptAfterBookmark),
    promptAfterLike: flag(promptAfterLike, DEFAULT_SETTINGS.promptAfterLike),
  };
}

export function updateSettings(db: LibraryDatabase, changes: Partial<Settings>): Promise<Settings> {
  return db.transaction('rw', db.meta, async () => {
    const settings = { ...(await readSettings(db)), ...changes };
    await db.meta.put({ accountId: '', key: SETTINGS, value: settings });
    return settings;
  });
}

/**
 * Records the theme x.com shows, for the library's Match X. Written only
 * when it changed, so that an open library does not re-read for nothing.
 */
export function recordXTheme(db: LibraryDatabase, theme: Theme): Promise<void> {
  return db.transaction('rw', db.meta, async () => {
    if ((await readXTheme(db)) !== theme)
      await db.meta.put({ accountId: '', key: X_THEME, value: theme });
  });
}

/** The theme last seen on x.com, if x.com has been visited since the last Delete all data. */
export async function readXTheme(db: LibraryDatabase): Promise<Theme | undefined> {
  const row = await db.meta.get(['', X_THEME]);
  return isTheme(row?.value) ? row.value : undefined;
}

/** Records a whole-library JSON export: the backup the reminder counts from. */
export function recordBackup(db: LibraryDatabase, accountId: AccountId, time: number) {
  return db.meta.put({ accountId, key: LAST_BACKUP, value: time });
}

/** Puts the backup reminder off for one interval. */
export function dismissBackupReminder(db: LibraryDatabase, accountId: AccountId, time: number) {
  return db.meta.put({ accountId, key: REMINDER_DISMISSED, value: time });
}

/** A stored profile, if it is one: a handle, and a picture only on X's image server. */
function profileOf(value: unknown): AccountProfile | undefined {
  if (!isRecord(value) || !isHandle(value.handle)) return undefined;
  return isXAvatarUrl(value.avatarUrl)
    ? { handle: value.handle, avatarUrl: value.avatarUrl }
    : { handle: value.handle };
}

/**
 * Keeps the @handle and picture x.com shows for an account, for the
 * library's header. Written only when they differ, so that an open library
 * does not re-read for nothing.
 */
export function recordProfile(
  db: LibraryDatabase,
  accountId: AccountId,
  profile: AccountProfile,
): Promise<void> {
  return db.transaction('rw', db.meta, async () => {
    const stored = profileOf((await db.meta.get([accountId, PROFILE]))?.value);
    if (stored?.handle === profile.handle && stored.avatarUrl === profile.avatarUrl) return;
    await db.meta.put({ accountId, key: PROFILE, value: profile });
  });
}

/** The accounts in one table, in order, found by skipping from one account to the next. */
async function accountsIn<Row>(table: Table<Row, [AccountId, string]>): Promise<AccountId[]> {
  const accounts: AccountId[] = [];
  let next = await table.toCollection().limit(1).primaryKeys();
  while (next[0]) {
    const [accountId] = next[0];
    accounts.push(accountId);
    next = await table.where(':id').above([accountId, Dexie.maxKey]).limit(1).primaryKeys();
  }
  return accounts;
}

/**
 * Every account this browser holds posts or tags for, with how much it holds
 * and its @handle and picture when known, in the order of their IDs.
 */
export function storedAccounts(db: LibraryDatabase): Promise<StoredAccount[]> {
  return db.transaction('r', db.posts, db.tags, db.postTags, db.meta, async () => {
    const found = await Promise.all([accountsIn(db.posts), accountsIn(db.tags)]);
    const accounts = [...new Set(found.flat())].sort(byId);
    return Promise.all(
      accounts.map(async (accountId) => {
        const range = allOf(accountId);
        const [posts, tags, assignments, row] = await Promise.all([
          db.posts
            .where(':id')
            .between(...range)
            .count(),
          db.tags
            .where(':id')
            .between(...range)
            .count(),
          db.postTags
            .where('[accountId+postId]')
            .between(...range)
            .count(),
          db.meta.get([accountId, PROFILE]),
        ]);
        return {
          accountId,
          ...profileOf(row?.value),
          posts,
          tags,
          assignments,
        };
      }),
    );
  });
}

/** Numeric IDs as strings, in numeric order. */
const byId = (a: string, b: string) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/** What the backup reminder needs. Times that are not numbers are left out. */
export async function backupTimes(db: LibraryDatabase, accountId: AccountId): Promise<BackupTimes> {
  return db.transaction('r', db.meta, db.posts, async () => {
    const [backup, dismissed, oldest] = await Promise.all([
      db.meta.get([accountId, LAST_BACKUP]),
      db.meta.get([accountId, REMINDER_DISMISSED]),
      db.posts
        .where('[accountId+savedAt]')
        .between(...allOf(accountId))
        .first(),
    ]);
    const time = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const lastBackupAt = time(backup?.value);
    const dismissedAt = time(dismissed?.value);
    return {
      ...(lastBackupAt !== undefined ? { lastBackupAt } : {}),
      ...(dismissedAt !== undefined ? { dismissedAt } : {}),
      ...(oldest ? { startedAt: oldest.savedAt } : {}),
    };
  });
}

/**
 * Deletes every account's posts, tags and tag assignments, and what is
 * recorded about them (DESIGN, 5.6). Settings are kept, so that a choice
 * such as not loading images from X survives. Returns the accounts that had
 * data, so that open x.com tabs can be told.
 */
export async function deleteAllData(db: LibraryDatabase): Promise<AccountId[]> {
  return db.transaction('rw', db.posts, db.tags, db.postTags, db.meta, async () => {
    const [posts, tags, meta] = await Promise.all([
      db.posts.toCollection().primaryKeys(),
      db.tags.toCollection().primaryKeys(),
      db.meta.toCollection().primaryKeys(),
    ]);
    const accounts = new Set([...posts, ...tags].map(([accountId]) => accountId));
    await Promise.all([
      db.posts.clear(),
      db.tags.clear(),
      db.postTags.clear(),
      db.meta.bulkDelete(
        meta.filter(([accountId, key]) => !(accountId === '' && key === SETTINGS)),
      ),
    ]);
    return [...accounts].sort();
  });
}
