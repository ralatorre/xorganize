import Dexie, { type Table } from 'dexie';
import type { Meta, PostTag, StoredPost, Tag } from './types';

/**
 * The library database. It lives under the extension's origin, so x.com can
 * neither read nor clear it. Content scripts never open it: they message the
 * background worker.
 *
 * Changing a table or an index means adding a new `version(n)` with an
 * upgrade function. Published versions are never edited.
 */
export class LibraryDatabase extends Dexie {
  posts!: Table<StoredPost, [string, string]>;
  tags!: Table<Tag, [string, string]>;
  postTags!: Table<PostTag, [string, string, string]>;
  meta!: Table<Meta, [string, string]>;

  constructor(name = 'xorganize') {
    super(name);
    this.version(1).stores({
      posts: [
        '[accountId+id]',
        '[accountId+isBookmark+bookmarkSort]',
        '[accountId+isLike+likeSort]',
        '[accountId+hasTags+savedAt]',
        '[accountId+savedAt]',
        '[accountId+author.handle]',
      ].join(', '),
      tags: '[accountId+id], &[accountId+nameKey], [accountId+lastUsedAt]',
      postTags: '[accountId+postId+tagId], [accountId+tagId+taggedAt], [accountId+postId]',
      meta: '[accountId+key]',
    });
  }
}

let shared: LibraryDatabase | undefined;

/** The one database connection for this context, opened on first use. */
export function library(): LibraryDatabase {
  shared ??= new LibraryDatabase();
  return shared;
}
