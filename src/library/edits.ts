/**
 * The changes the library page makes: to a post's tags, to tags themselves,
 * taking a post out, and deleting everything. Each write is announced once
 * it is done, so that open x.com tabs catch up (`TAGS_CHANNEL`). The
 * library's own lists follow the database through live queries and need no
 * announcement.
 */

import { deleteAllData, removePost, restorePost, type RemovedPost } from '@/src/db/repo';
import type { LibraryDatabase } from '@/src/db/schema';
import {
  deleteTag,
  mergeTags,
  recentTags,
  recolourTag,
  renameTag,
  setPostTags,
  suggestTags,
  tagsForPosts,
  type RenameResult,
  type TagDeletion,
} from '@/src/db/tags';
import type { AccountId, PostId, TagId, TagSuggestion, TagSummary } from '@/src/db/types';

export interface LibraryEdits {
  tagsOf(accountId: AccountId, postIds: PostId[]): Promise<Map<PostId, TagSummary[]>>;
  suggest(
    accountId: AccountId,
    query: string,
    limit: number,
  ): Promise<{ suggestions: TagSuggestion[]; recent: TagSummary[] }>;
  setTags(
    accountId: AccountId,
    postId: PostId,
    change: { add: string[]; remove: TagId[] },
  ): Promise<TagSummary[]>;
  rename(accountId: AccountId, tagId: TagId, name: string): Promise<RenameResult>;
  recolour(accountId: AccountId, tagId: TagId, colour: number): Promise<boolean>;
  merge(accountId: AccountId, fromId: TagId, intoId: TagId): Promise<boolean>;
  deleteTag(accountId: AccountId, tagId: TagId): Promise<TagDeletion>;
  /** Resolves to what was removed, for Undo, or undefined if the post was not there. */
  removePost(accountId: AccountId, postId: PostId): Promise<RemovedPost | undefined>;
  /** Puts back what `removePost` removed. */
  restorePost(removed: RemovedPost): Promise<void>;
  /** Deletes every account's library, keeping settings. */
  deleteAll(): Promise<void>;
}

/** `announce` is called with the account after each write that changed something. */
export function createLibraryEdits(
  db: LibraryDatabase,
  announce: (accountId: AccountId) => void,
): LibraryEdits {
  const announced = async <T>(
    accountId: AccountId,
    write: Promise<T>,
    changed: (result: T) => boolean = () => true,
  ): Promise<T> => {
    const result = await write;
    if (changed(result)) announce(accountId);
    return result;
  };

  return {
    tagsOf: (accountId, postIds) => tagsForPosts(db, accountId, postIds),
    suggest: async (accountId, query, limit) => ({
      suggestions: await suggestTags(db, accountId, query, limit),
      recent: await recentTags(db, accountId),
    }),
    setTags: (accountId, postId, change) =>
      announced(accountId, setPostTags(db, { accountId, postId, ...change })),
    rename: (accountId, tagId, name) =>
      announced(accountId, renameTag(db, accountId, tagId, name), (result) => result.ok),
    recolour: (accountId, tagId, colour) =>
      announced(accountId, recolourTag(db, accountId, tagId, colour), (done) => done),
    merge: (accountId, fromId, intoId) =>
      announced(accountId, mergeTags(db, accountId, fromId, intoId), (done) => done),
    deleteTag: (accountId, tagId) => announced(accountId, deleteTag(db, accountId, tagId)),
    removePost: (accountId, postId) =>
      announced(accountId, removePost(db, accountId, postId), (removed) => removed !== undefined),
    restorePost: (removed) => announced(removed.post.accountId, restorePost(db, removed)),
    deleteAll: async () => {
      for (const accountId of await deleteAllData(db)) announce(accountId);
    },
  };
}
