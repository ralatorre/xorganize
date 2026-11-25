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
  items: Array<{ post: CapturedPost; sortIndex?: string }>;
  /** Posts that other posts refer to: kept so those can be shown in full. */
  referenced: CapturedPost[];
  /** Posts that X reports as no longer available. */
  unavailable: PostId[];
}

const ACTIVE_ACCOUNT = 'activeAccount';
const SORT_WIDTH = 30;

/**
 * A string that sorts the way a timeline position does.
 *
 * A real sort index is padded to a fixed width, so string order matches
 * numeric order. A post the user has just bookmarked or liked has no index
 * yet, so it gets a provisional key from the time, behind a `~` that sorts
 * above every digit: newest first, until the timeline supplies the real one.
 */
export function sortKey(sortIndex: string | undefined, now: number): string {
  return sortIndex !== undefined
    ? sortIndex.padStart(SORT_WIDTH, '0')
    : `~${String(now).padStart(SORT_WIDTH - 1, '0')}`;
}

export interface MergeContext {
  accountId: AccountId;
  source?: SourceKind;
  sortIndex?: string;
  now: number;
}

/**
 * Combines a freshly captured post with the stored copy, if there is one.
 *
 * - Content comes from the new capture, which is the more recent.
 * - A source is set by the timeline or change the post arrived through, and
 *   otherwise follows the account's own state as the API reports it.
 * - Timestamps of first sight and of entering the library never move forward.
 * - Tags and their flag are left alone.
 */
export function mergePost(
  existing: StoredPost | undefined,
  captured: CapturedPost,
  context: MergeContext,
): StoredPost {
  const { bookmarked, liked, ...content } = captured;
  const { now } = context;

  const flag = (source: SourceKind, reported: boolean | undefined, stored: 0 | 1): 0 | 1 => {
    if (context.source === source) return 1;
    if (reported !== undefined) return reported ? 1 : 0;
    return stored;
  };
  const isBookmark = flag('bookmark', bookmarked, existing?.isBookmark ?? 0);
  const isLike = flag('like', liked, existing?.isLike ?? 0);

  const sort = (source: SourceKind, set: 0 | 1, stored: string | undefined) => {
    if (!set) return undefined;
    if (context.source === source && context.sortIndex !== undefined) {
      return sortKey(context.sortIndex, now);
    }
    return stored ?? sortKey(undefined, now);
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
    partial: false,
    unavailable: false,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    savedAt: existing?.savedAt ?? now,
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
    const save = async (post: CapturedPost, source?: SourceKind, sortIndex?: string) => {
      const existing = await db.posts.get([accountId, post.id]);
      await db.posts.put(mergePost(existing, post, { accountId, source, sortIndex, now }));
    };

    // Referenced posts first, so a post that is both referenced and an item
    // ends up with the item's source.
    for (const post of batch.referenced) await save(post);
    for (const { post, sortIndex } of batch.items) await save(post, batch.source, sortIndex);

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
