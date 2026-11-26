/**
 * Reads what an export holds, in one transaction so that the file is a
 * consistent picture of the library.
 */

import Dexie from 'dexie';
import type { LibraryDatabase } from '@/src/db/schema';
import type { AccountId, PostId, PostTag, StoredPost, Tag } from '@/src/db/types';

/** The whole library, or the posts a view shows (with the tag name when the view is one tag). */
export type ExportScope = 'library' | { postIds: readonly PostId[]; tag?: string };

export interface ExportData {
  /** The posts exported, in the library's order. */
  posts: StoredPost[];
  /** Posts those quote that are stored but not exported themselves, so that quotes still show after import. */
  quoted: StoredPost[];
  /** The whole library's tags, used or not; for a view, the tags its posts carry. */
  tags: Tag[];
  /** The exported posts' tags. */
  postTags: PostTag[];
}

/** In the library: bookmarked, liked or tagged. Other stored posts are there because one of those quotes them. */
export const inLibrary = (post: StoredPost) =>
  post.isBookmark === 1 || post.isLike === 1 || post.hasTags === 1;

export async function readExport(
  db: LibraryDatabase,
  accountId: AccountId,
  scope: ExportScope,
): Promise<ExportData> {
  const all = [
    [accountId, Dexie.minKey],
    [accountId, Dexie.maxKey],
  ] as const;

  return db.transaction('r', db.posts, db.tags, db.postTags, async () => {
    const [tags, links] = await Promise.all([
      db.tags
        .where('[accountId+id]')
        .between(...all)
        .toArray(),
      db.postTags
        .where('[accountId+postId]')
        .between(...all)
        .toArray(),
    ]);

    let posts: StoredPost[];
    let others: (ids: PostId[]) => Promise<StoredPost[]>;
    if (scope === 'library') {
      // Newest in the library first, as the Saved order shows them.
      const stored = await db.posts
        .where('[accountId+savedAt]')
        .between(...all)
        .reverse()
        .toArray();
      posts = stored.filter(inLibrary);
      const rest = new Map(
        stored.filter((post) => !inLibrary(post)).map((post) => [post.id, post]),
      );
      others = async (ids) => ids.flatMap((id) => rest.get(id) ?? []);
    } else {
      posts = await postsById(db, accountId, [...new Set(scope.postIds)]);
      others = (ids) => postsById(db, accountId, ids);
    }

    const exported = new Set(posts.map((post) => post.id));
    const quotedIds = [
      ...new Set(posts.flatMap((post) => (post.quotedId ? [post.quotedId] : []))),
    ].filter((id) => !exported.has(id));
    const postTags = links.filter((link) => exported.has(link.postId));
    const used = new Set(postTags.map((link) => link.tagId));

    return {
      posts,
      quoted: await others(quotedIds),
      tags: scope === 'library' ? tags : tags.filter((tag) => used.has(tag.id)),
      postTags,
    };
  });
}

async function postsById(
  db: LibraryDatabase,
  accountId: AccountId,
  ids: readonly PostId[],
): Promise<StoredPost[]> {
  const found = await db.posts.bulkGet(ids.map((id): [AccountId, PostId] => [accountId, id]));
  return found.filter((post): post is StoredPost => post !== undefined);
}
