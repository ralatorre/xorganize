/**
 * Reads what post cards show, for the few rows on screen: each post, its
 * tags in the order they were applied, and the post it quotes when that is
 * stored.
 */

import type { LibraryDatabase } from '@/src/db/schema';
import { tagsForPosts } from '@/src/db/tags';
import type { AccountId, PostId, StoredPost, TagSummary } from '@/src/db/types';

export interface PostView {
  post: StoredPost;
  tags: TagSummary[];
  quoted?: StoredPost;
}

export const NO_POSTS: ReadonlyMap<PostId, PostView> = new Map();

export async function loadPosts(
  db: LibraryDatabase,
  accountId: AccountId,
  ids: readonly PostId[],
): Promise<Map<PostId, PostView>> {
  if (ids.length === 0) return new Map();
  return db.transaction('r', db.posts, db.tags, db.postTags, async () => {
    const posts = await storedPosts(db, accountId, ids);
    const [tags, quoted] = await Promise.all([
      tagsForPosts(db, accountId, ids),
      storedPosts(
        db,
        accountId,
        posts.flatMap((post) => (post.quotedId ? [post.quotedId] : [])),
      ),
    ]);
    const quotedById = new Map(quoted.map((post) => [post.id, post]));
    return new Map(
      posts.map((post) => {
        const quote = post.quotedId ? quotedById.get(post.quotedId) : undefined;
        const view: PostView = { post, tags: tags.get(post.id) ?? [] };
        return [post.id, quote ? { ...view, quoted: quote } : view];
      }),
    );
  });
}

async function storedPosts(
  db: LibraryDatabase,
  accountId: AccountId,
  ids: readonly PostId[],
): Promise<StoredPost[]> {
  const found = await db.posts.bulkGet(ids.map((id): [AccountId, PostId] => [accountId, id]));
  return found.filter((post): post is StoredPost => post !== undefined);
}
