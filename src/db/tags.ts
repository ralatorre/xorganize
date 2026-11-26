/**
 * Every read and write of tags. Writes that touch `postTags` also keep
 * `posts.hasTags` and `tags.lastUsedAt` in step, in the same transaction
 * (docs/SPEC.md, 9.2).
 */

import Dexie from 'dexie';
import type { CapturedPost } from '@/src/capture/normalise';
import { parseTagName, tagKey } from '@/src/tags/names';
import { nextColour } from '@/src/tags/palette';
import { mergePost, rememberAccount } from './repo';
import type { LibraryDatabase } from './schema';
import type { AccountId, PostId, Tag, TagId, TagSuggestion, TagSummary } from './types';

/** How many recently used tags the popover offers. */
export const RECENT_TAGS = 5;

/** One change the user made to a post's tags. */
export interface TagChange {
  accountId: AccountId;
  postId: PostId;
  /** Names to add. A tag is created for any name not in use yet. */
  add: string[];
  /** Tags to take off. */
  remove: TagId[];
  /** The post itself, so that one not yet in the library can be stored. */
  post?: CapturedPost;
  /** The post was read from the page rather than from the API (SPEC 7.6). */
  partial?: boolean;
}

export interface TagWriteOptions {
  now?: number;
  newId?: () => TagId;
}

export class UnknownPostError extends Error {
  constructor(postId: PostId) {
    super(`post ${postId} is not in the library and was not supplied`);
  }
}

const summaryOf = (tag: Tag): TagSummary => ({ id: tag.id, name: tag.name, color: tag.color });

/** The tags on each of the given posts, in the order they were applied. */
export async function tagsForPosts(
  db: LibraryDatabase,
  accountId: AccountId,
  postIds: readonly PostId[],
): Promise<Map<PostId, TagSummary[]>> {
  return db.transaction('r', db.postTags, db.tags, async () => {
    const result = new Map<PostId, TagSummary[]>();
    for (const postId of new Set(postIds)) {
      result.set(postId, await tagsOfPost(db, accountId, postId));
    }
    return result;
  });
}

async function tagsOfPost(
  db: LibraryDatabase,
  accountId: AccountId,
  postId: PostId,
): Promise<TagSummary[]> {
  const links = await db.postTags.where('[accountId+postId]').equals([accountId, postId]).toArray();
  links.sort((a, b) => a.taggedAt - b.taggedAt);
  const tags = await db.tags.bulkGet(links.map((link) => [accountId, link.tagId]));
  return tags.flatMap((tag) => (tag ? [summaryOf(tag)] : []));
}

/** How many posts carry the tag. Counted, not stored, so it cannot drift. */
export function useCount(db: LibraryDatabase, accountId: AccountId, tagId: TagId): Promise<number> {
  return db.postTags
    .where('[accountId+tagId+taggedAt]')
    .between([accountId, tagId, Dexie.minKey], [accountId, tagId, Dexie.maxKey])
    .count();
}

/**
 * Tags matching what has been typed: names that start with it first, then
 * names that contain it, each group by how many posts carry the tag.
 */
export async function suggestTags(
  db: LibraryDatabase,
  accountId: AccountId,
  query: string,
  limit: number,
): Promise<TagSuggestion[]> {
  return db.transaction('r', db.tags, db.postTags, async () => {
    const key = tagKey(query);
    const tags = await db.tags
      .where('[accountId+lastUsedAt]')
      .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
      .toArray();
    const matches = tags.filter((tag) => tag.nameKey.includes(key));
    const counted = await Promise.all(
      matches.map(async (tag) => ({
        ...summaryOf(tag),
        count: await useCount(db, accountId, tag.id),
        prefix: tag.nameKey.startsWith(key),
        nameKey: tag.nameKey,
      })),
    );
    counted.sort(
      (a, b) =>
        Number(b.prefix) - Number(a.prefix) ||
        b.count - a.count ||
        a.nameKey.localeCompare(b.nameKey),
    );
    return counted
      .slice(0, limit)
      .map(({ id, name, color, count }) => ({ id, name, color, count }));
  });
}

export interface TagIndex {
  /** Every tag, by name, with how many posts carry it. */
  tags: TagSuggestion[];
  /** The posts carrying each tag. A tag on no post has no entry. */
  posts: ReadonlyMap<TagId, ReadonlySet<PostId>>;
}

/**
 * Every tag with the posts that carry it. Read in one pass over the index,
 * without reading any post, and counted rather than stored, so counts cannot
 * drift.
 */
export async function tagIndex(db: LibraryDatabase, accountId: AccountId): Promise<TagIndex> {
  return db.transaction('r', db.tags, db.postTags, async () => {
    const [tags, links] = await Promise.all([
      db.tags
        .where('[accountId+id]')
        .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
        .toArray(),
      db.postTags
        .where('[accountId+tagId+taggedAt]')
        .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
        .primaryKeys(),
    ]);
    const posts = new Map<TagId, Set<PostId>>();
    for (const [, postId, tagId] of links) {
      const carrying = posts.get(tagId) ?? new Set<PostId>();
      carrying.add(postId);
      posts.set(tagId, carrying);
    }
    return {
      tags: tags
        .sort((a, b) => a.nameKey.localeCompare(b.nameKey))
        .map((tag) => ({ ...summaryOf(tag), count: posts.get(tag.id)?.size ?? 0 })),
      posts,
    };
  });
}

/** The most recently used tags, newest first. */
export async function recentTags(
  db: LibraryDatabase,
  accountId: AccountId,
  limit = RECENT_TAGS,
): Promise<TagSummary[]> {
  const tags = await db.tags
    .where('[accountId+lastUsedAt]')
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
  return tags.map(summaryOf);
}

/**
 * Applies one change to a post's tags and returns the post's tags afterwards.
 *
 * Tags are created for new names. A post not yet in the library is stored
 * from `change.post`; tagging never changes whether it is bookmarked or liked
 * (DESIGN, decision 4). A post left with no tags and no source is removed, as
 * when a source is cleared. A tag left on no post stays, for later use.
 */
export async function setPostTags(
  db: LibraryDatabase,
  change: TagChange,
  options: TagWriteOptions = {},
): Promise<TagSummary[]> {
  const now = options.now ?? Date.now();
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { accountId, postId } = change;

  return db.transaction('rw', db.posts, db.tags, db.postTags, db.meta, async () => {
    const existing = await db.posts.get([accountId, postId]);
    const post = change.post
      ? mergePost(existing, change.post, { accountId, now, partial: change.partial === true })
      : existing;
    if (!post) {
      if (change.add.length === 0) return [];
      throw new UnknownPostError(postId);
    }

    for (const tagId of change.remove) {
      await db.postTags.delete([accountId, postId, tagId]);
    }

    for (const raw of change.add) {
      const parsed = parseTagName(raw);
      if (!parsed.ok) continue;
      const tag = await findOrCreateTag(db, accountId, parsed, now, newId);
      const link = await db.postTags.get([accountId, postId, tag.id]);
      if (!link) await db.postTags.put({ accountId, postId, tagId: tag.id, taggedAt: now });
      await db.tags.update([accountId, tag.id], { lastUsedAt: now });
    }

    const tags = await tagsOfPost(db, accountId, postId);
    post.hasTags = tags.length > 0 ? 1 : 0;
    if (post.isBookmark || post.isLike || post.hasTags) {
      await db.posts.put(post);
      await rememberAccount(db, accountId);
    } else {
      await db.posts.delete([accountId, postId]);
    }
    return tags;
  });
}

async function findOrCreateTag(
  db: LibraryDatabase,
  accountId: AccountId,
  parsed: { name: string; nameKey: string },
  now: number,
  newId: () => TagId,
): Promise<Tag> {
  const found = await db.tags
    .where('[accountId+nameKey]')
    .equals([accountId, parsed.nameKey])
    .first();
  if (found) return found;
  const colours = await db.tags
    .where('[accountId+lastUsedAt]')
    .between([accountId, Dexie.minKey], [accountId, Dexie.maxKey])
    .toArray();
  const tag: Tag = {
    accountId,
    id: newId(),
    name: parsed.name,
    nameKey: parsed.nameKey,
    color: nextColour(colours.map((other) => other.color)),
    createdAt: now,
    lastUsedAt: now,
  };
  await db.tags.add(tag);
  return tag;
}
