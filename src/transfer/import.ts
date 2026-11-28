/**
 * Import (docs/SPEC.md, 12.3): reads a file, checks all of it, and writes it
 * into the library in one transaction, merged with what is there or in its
 * place. The file's account is the one written to.
 */

import Dexie from 'dexie';
import { rememberAccount } from '@/src/db/repo';
import type { LibraryDatabase } from '@/src/db/schema';
import type { AccountId, PostId, PostTag, StoredPost, Tag, TagId } from '@/src/db/types';
import { tagKey } from '@/src/tags/names';
import { exportedPost, type ExportedPost } from './format';
import {
  DEFAULT_IMPORT_LIMITS,
  parseBackup,
  type Backup,
  type ImportLimits,
  type ParsedBackup,
} from './validate';

/** Merge keeps what the library holds and adds the file to it. Replace empties the library first. */
export type ImportMode = 'merge' | 'replace';

/** What the preview shows before anything is written. */
export interface BackupSummary {
  accountId: AccountId;
  /** Bookmarked, liked or tagged posts: not the quoted posts carried with them. */
  posts: number;
  tags: number;
  postTags: number;
  exportedAt: string;
  /** Holds some of a library, so it cannot replace one. */
  partial: boolean;
}

export interface ImportResult {
  accountId: AccountId;
  posts: number;
  tags: number;
}

export interface ImportOptions {
  now?: number;
  newId?: () => TagId;
}

export class PartialReplaceError extends Error {
  constructor() {
    super('a file holding part of a library cannot replace it');
  }
}

/** Reads and checks a file the user picked. A file over the size limit is not read at all. */
export async function readBackup(
  file: Pick<Blob, 'size' | 'text'>,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ParsedBackup> {
  if (file.size > limits.bytes) return { ok: false, problem: { kind: 'too-large' } };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, problem: { kind: 'unreadable' } };
  }
  return parseBackup(text, file.size, limits);
}

export function backupSummary(backup: Backup): BackupSummary {
  const tagged = new Set(backup.postTags.map((link) => link.postId));
  return {
    accountId: backup.header.accountId,
    posts: backup.posts.filter((post) => post.isBookmark || post.isLike || tagged.has(post.id))
      .length,
    tags: backup.tags.length,
    postTags: backup.postTags.length,
    exportedAt: backup.header.exportedAt,
    partial: backup.header.scope === 'partial',
  };
}

/**
 * One post from the file, combined with the stored copy if there is one,
 * by the rules a capture follows (9.2):
 *
 * - Sources are combined. Each keeps its position from the newer copy, the
 *   one stored from X more recently, when that copy is in the source.
 * - The content comes from the newer copy, except that a partial copy never
 *   replaces a full one.
 * - Whether X still has the post comes from the newer copy.
 * - When it left a source, while it is in neither copy's source, comes from
 *   the newer copy that records it.
 * - The times of first sight and of entering the library keep the earlier.
 * - It counts as stored now, so that search reads it again (11).
 */
export function mergeImported(
  existing: StoredPost | undefined,
  incoming: ExportedPost,
  accountId: AccountId,
  now: number,
): StoredPost {
  if (!existing) return { ...incoming, accountId, hasTags: 0, lastSeenAt: now };

  const stored = exportedPost(existing);
  const newer = incoming.lastSeenAt > stored.lastSeenAt ? incoming : stored;
  const older = newer === incoming ? stored : incoming;
  const body = newer.partial && !older.partial ? older : newer;
  const position = (flag: 'isBookmark' | 'isLike', key: 'bookmarkSort' | 'likeSort') =>
    newer[flag] === 1 ? newer[key] : older[flag] === 1 ? older[key] : undefined;
  const bookmarkSort = position('isBookmark', 'bookmarkSort');
  const likeSort = position('isLike', 'likeSort');

  const merged: StoredPost = {
    ...body,
    accountId,
    isBookmark: incoming.isBookmark || stored.isBookmark ? 1 : 0,
    isLike: incoming.isLike || stored.isLike ? 1 : 0,
    hasTags: existing.hasTags,
    unavailable: newer.unavailable,
    firstSeenAt: Math.min(incoming.firstSeenAt, stored.firstSeenAt),
    lastSeenAt: now,
    savedAt: Math.min(incoming.savedAt, stored.savedAt),
  };
  delete merged.bookmarkSort;
  delete merged.likeSort;
  delete merged.unbookmarkedAt;
  delete merged.unlikedAt;
  if (bookmarkSort !== undefined) merged.bookmarkSort = bookmarkSort;
  if (likeSort !== undefined) merged.likeSort = likeSort;
  const lost = (flag: 'isBookmark' | 'isLike', key: 'unbookmarkedAt' | 'unlikedAt') =>
    merged[flag] ? undefined : (newer[key] ?? older[key]);
  const unbookmarkedAt = lost('isBookmark', 'unbookmarkedAt');
  const unlikedAt = lost('isLike', 'unlikedAt');
  if (unbookmarkedAt !== undefined) merged.unbookmarkedAt = unbookmarkedAt;
  if (unlikedAt !== undefined) merged.unlikedAt = unlikedAt;
  return merged;
}

/**
 * Writes a checked file into its account's library.
 *
 * - Tags are matched by name, ignoring case and spacing: a tag the library
 *   already has keeps its name and colour and gains the file's posts. A new
 *   tag keeps the file's ID unless the library uses it already.
 * - Posts are matched by ID (`mergeImported`). A post tagged twice keeps the
 *   earlier tagging time.
 * - Replace first removes the account's posts, tags and tag assignments. A
 *   file marked partial cannot replace a library.
 */
export async function importBackup(
  db: LibraryDatabase,
  backup: Backup,
  mode: ImportMode,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const now = options.now ?? Date.now();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { accountId } = backup.header;
  if (mode === 'replace' && backup.header.scope === 'partial') throw new PartialReplaceError();
  const all = [
    [accountId, Dexie.minKey],
    [accountId, Dexie.maxKey],
  ] as const;

  return db.transaction('rw', db.posts, db.tags, db.postTags, db.meta, async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.postTags
          .where('[accountId+postId]')
          .between(...all)
          .delete(),
        db.tags
          .where('[accountId+id]')
          .between(...all)
          .delete(),
        db.posts
          .where('[accountId+id]')
          .between(...all)
          .delete(),
      ]);
    }

    const tagIds = await importTags(db, accountId, backup, newId);

    const ids = backup.posts.map((post) => post.id);
    const stored = await db.posts.bulkGet(ids.map((id): [AccountId, PostId] => [accountId, id]));
    const posts = backup.posts.map((post, index) =>
      mergeImported(stored[index], post, accountId, now),
    );

    const links = backup.postTags.map((link): PostTag => ({
      accountId,
      postId: link.postId,
      tagId: tagIds.get(link.tagId)!,
      taggedAt: link.taggedAt,
    }));
    const held = await db.postTags.bulkGet(
      links.map((link): [AccountId, PostId, TagId] => [accountId, link.postId, link.tagId]),
    );
    links.forEach((link, index) => {
      const before = held[index];
      if (before) link.taggedAt = Math.min(before.taggedAt, link.taggedAt);
    });

    const tagged = new Set(links.map((link) => link.postId));
    for (const post of posts) if (tagged.has(post.id)) post.hasTags = 1;

    await db.posts.bulkPut(posts);
    await db.postTags.bulkPut(links);
    await rememberAccount(db, accountId);
    return {
      accountId,
      posts: posts.filter((post) => post.isBookmark || post.isLike || tagged.has(post.id)).length,
      tags: backup.tags.length,
    };
  });
}

/** Writes the file's tags and returns, for each of the file's tag IDs, the ID it has in the library. */
async function importTags(
  db: LibraryDatabase,
  accountId: AccountId,
  backup: Backup,
  newId: () => TagId,
): Promise<Map<TagId, TagId>> {
  const existing = await db.tags
    .where('[accountId+id]')
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .toArray();
  const byKey = new Map(existing.map((tag) => [tag.nameKey, tag]));
  const usedIds = new Set(existing.map((tag) => tag.id));
  const ids = new Map<TagId, TagId>();
  const writes: Tag[] = [];

  for (const tag of backup.tags) {
    const nameKey = tagKey(tag.name);
    const match = byKey.get(nameKey);
    if (match) {
      writes.push({
        ...match,
        createdAt: Math.min(match.createdAt, tag.createdAt),
        lastUsedAt: Math.max(match.lastUsedAt, tag.lastUsedAt),
      });
      ids.set(tag.id, match.id);
      continue;
    }
    let id = tag.id;
    while (usedIds.has(id)) id = newId();
    usedIds.add(id);
    writes.push({ accountId, ...tag, id, nameKey });
    ids.set(tag.id, id);
  }
  await db.tags.bulkPut(writes);
  return ids;
}
