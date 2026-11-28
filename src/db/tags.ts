/**
 * Every read and write of tags. Writes that touch `postTags` also keep
 * `posts.hasTags` and `tags.lastUsedAt` in step, in the same transaction
 * (docs/SPEC.md, 9.2).
 */

import Dexie from 'dexie';
import type { CapturedPost } from '@/src/capture/normalise';
import { parseTagName, tagKey, type TagNameProblem } from '@/src/tags/names';
import { TAG_COLOURS, nextColour } from '@/src/tags/palette';
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

/** Why a tag could not be created. */
export type CreateProblem = TagNameProblem | 'taken';

export type CreateResult = { ok: true; tag: TagSummary } | { ok: false; problem: CreateProblem };

/**
 * Creates a tag that no post carries yet, with the next unused colour. A name
 * another tag already has is refused, ignoring case and spacing.
 */
export async function createTag(
  db: LibraryDatabase,
  accountId: AccountId,
  name: string,
  options: TagWriteOptions = {},
): Promise<CreateResult> {
  const parsed = parseTagName(name);
  if (!parsed.ok) return parsed;
  const now = options.now ?? Date.now();
  const newId = options.newId ?? (() => crypto.randomUUID());
  return db.transaction('rw', db.tags, async () => {
    if (await tagNamed(db, accountId, parsed.nameKey)) {
      return { ok: false, problem: 'taken' } as const;
    }
    const tag = await addTag(db, accountId, parsed, now, newId);
    return { ok: true, tag: summaryOf(tag) } as const;
  });
}

/** Why a tag could not be renamed. */
export type RenameProblem = TagNameProblem | 'taken' | 'missing';

export type RenameResult = { ok: true; tag: TagSummary } | { ok: false; problem: RenameProblem };

/**
 * Gives a tag a new name. A change of casing or spacing alone is allowed; a
 * name another tag already has is not, since that is a merge (`mergeTags`).
 */
export async function renameTag(
  db: LibraryDatabase,
  accountId: AccountId,
  tagId: TagId,
  name: string,
): Promise<RenameResult> {
  const parsed = parseTagName(name);
  if (!parsed.ok) return parsed;
  return db.transaction('rw', db.tags, async () => {
    const tag = await db.tags.get([accountId, tagId]);
    if (!tag) return { ok: false, problem: 'missing' } as const;
    const holder = await db.tags
      .where('[accountId+nameKey]')
      .equals([accountId, parsed.nameKey])
      .first();
    if (holder && holder.id !== tagId) return { ok: false, problem: 'taken' } as const;
    await db.tags.update([accountId, tagId], { name: parsed.name, nameKey: parsed.nameKey });
    return { ok: true, tag: { ...summaryOf(tag), name: parsed.name } } as const;
  });
}

/** Gives a tag another colour from the palette. False if the tag or colour does not exist. */
export async function recolourTag(
  db: LibraryDatabase,
  accountId: AccountId,
  tagId: TagId,
  color: number,
): Promise<boolean> {
  if (!Number.isInteger(color) || color < 0 || color >= TAG_COLOURS) return false;
  return (await db.tags.update([accountId, tagId], { color })) === 1;
}

/**
 * Moves every post from one tag to another and removes the first. A post that
 * already carries both keeps the earlier of the two times it was tagged.
 * False if either tag does not exist, or they are the same tag.
 */
export async function mergeTags(
  db: LibraryDatabase,
  accountId: AccountId,
  fromId: TagId,
  intoId: TagId,
): Promise<boolean> {
  if (fromId === intoId) return false;
  return db.transaction('rw', db.tags, db.postTags, async () => {
    const [from, into] = await db.tags.bulkGet([
      [accountId, fromId],
      [accountId, intoId],
    ]);
    if (!from || !into) return false;
    const links = await linksOf(db, accountId, fromId);
    for (const link of links) {
      const kept = await db.postTags.get([accountId, link.postId, intoId]);
      const taggedAt = Math.min(link.taggedAt, kept?.taggedAt ?? Infinity);
      await db.postTags.put({ accountId, postId: link.postId, tagId: intoId, taggedAt });
    }
    await db.postTags.bulkDelete(links.map((link) => [accountId, link.postId, fromId]));
    await db.tags.delete([accountId, fromId]);
    await db.tags.update([accountId, intoId], {
      lastUsedAt: Math.max(from.lastUsedAt, into.lastUsedAt),
    });
    return true;
  });
}

/** What deleting a tag did. */
export interface TagDeletion {
  /** Posts the tag was taken off. */
  untagged: number;
  /** Of those, posts that had no other tag and no source, and so left the library. */
  removed: number;
}

/**
 * Takes a tag off every post and removes it. A post that is still bookmarked,
 * liked or tagged otherwise stays. One that was in the library only for this
 * tag goes, as when its last tag is taken off (SPEC 9.1).
 */
export async function deleteTag(
  db: LibraryDatabase,
  accountId: AccountId,
  tagId: TagId,
): Promise<TagDeletion> {
  return db.transaction('rw', db.posts, db.tags, db.postTags, async () => {
    const links = await linksOf(db, accountId, tagId);
    await db.postTags.bulkDelete(links.map((link) => [accountId, link.postId, tagId]));
    await db.tags.delete([accountId, tagId]);
    let removed = 0;
    for (const { postId } of links) {
      const post = await db.posts.get([accountId, postId]);
      const tagged = await db.postTags
        .where('[accountId+postId]')
        .equals([accountId, postId])
        .count();
      if (!post || tagged > 0) continue;
      if (post.isBookmark || post.isLike) {
        await db.posts.update([accountId, postId], { hasTags: 0 });
      } else {
        await db.posts.delete([accountId, postId]);
        removed += 1;
      }
    }
    return { untagged: links.length, removed };
  });
}

function linksOf(db: LibraryDatabase, accountId: AccountId, tagId: TagId) {
  return db.postTags
    .where('[accountId+tagId+taggedAt]')
    .between([accountId, tagId, Dexie.minKey], [accountId, tagId, Dexie.maxKey])
    .toArray();
}

async function findOrCreateTag(
  db: LibraryDatabase,
  accountId: AccountId,
  parsed: { name: string; nameKey: string },
  now: number,
  newId: () => TagId,
): Promise<Tag> {
  return (
    (await tagNamed(db, accountId, parsed.nameKey)) ??
    (await addTag(db, accountId, parsed, now, newId))
  );
}

function tagNamed(db: LibraryDatabase, accountId: AccountId, nameKey: string) {
  return db.tags.where('[accountId+nameKey]').equals([accountId, nameKey]).first();
}

/** A new tag with the colour fewest tags have. */
async function addTag(
  db: LibraryDatabase,
  accountId: AccountId,
  parsed: { name: string; nameKey: string },
  now: number,
  newId: () => TagId,
): Promise<Tag> {
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
