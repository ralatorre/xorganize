/**
 * Every read and write of the library goes through here.
 */

import Dexie from 'dexie';
import type { CapturedPost } from '@/src/capture/normalise';
import type { SourceKind } from '@/src/capture/operations';
import type { LibraryDatabase } from './schema';
import type { AccountId, Counts, PostId, StoredPost } from './types';

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

  return {
    accountId: context.accountId,
    ...content,
    isBookmark,
    isLike,
    hasTags: existing?.hasTags ?? 0,
    ...(bookmarkSort !== undefined ? { bookmarkSort } : {}),
    ...(likeSort !== undefined ? { likeSort } : {}),
    partial: context.partial === true && !keepStored,
    unavailable: false,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    savedAt: existing?.savedAt ?? now,
  };
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

    await db.meta.put({ accountId: '', key: ACTIVE_ACCOUNT, value: accountId });
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
): Promise<Counts> {
  return db.transaction('rw', db.posts, async () => {
    const post = await db.posts.get([accountId, postId]);
    if (post) {
      if (source === 'bookmark') {
        post.isBookmark = 0;
        delete post.bookmarkSort;
      } else {
        post.isLike = 0;
        delete post.likeSort;
      }
      if (post.isBookmark || post.isLike || post.hasTags) await db.posts.put(post);
      else await db.posts.delete([accountId, postId]);
    }
    return counts(db, accountId);
  });
}

export async function counts(db: LibraryDatabase, accountId: AccountId): Promise<Counts> {
  const count = (index: string) =>
    db.posts
      .where(index)
      .between([accountId, 1, Dexie.minKey], [accountId, 1, Dexie.maxKey])
      .count();
  const [bookmarks, likes] = await Promise.all([
    count('[accountId+isBookmark+bookmarkSort]'),
    count('[accountId+isLike+likeSort]'),
  ]);
  return { bookmarks, likes };
}

/** A source's posts in timeline order, newest first. */
export function postsBySource(
  db: LibraryDatabase,
  accountId: AccountId,
  source: SourceKind,
  limit: number,
): Promise<StoredPost[]> {
  const index =
    source === 'bookmark' ? '[accountId+isBookmark+bookmarkSort]' : '[accountId+isLike+likeSort]';
  return db.posts
    .where(index)
    .between([accountId, 1, Dexie.minKey], [accountId, 1, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
}

/** The account that most recently captured something, if any has. */
export async function activeAccount(db: LibraryDatabase): Promise<AccountId | undefined> {
  const row = await db.meta.get(['', ACTIVE_ACCOUNT]);
  return typeof row?.value === 'string' ? row.value : undefined;
}

/** How many of the account's posts are both bookmarked and liked. */
export function countInBoth(db: LibraryDatabase, accountId: AccountId): Promise<number> {
  return db.posts
    .where('[accountId+isBookmark+bookmarkSort]')
    .between([accountId, 1, Dexie.minKey], [accountId, 1, Dexie.maxKey])
    .filter((post) => post.isLike === 1)
    .count();
}
