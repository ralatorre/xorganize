/**
 * Which posts a view shows, and in what order, worked out from post IDs
 * alone. The database supplies the sets and orders; nothing here reads it.
 */

import type { PostId } from '@/src/db/types';
import type { SourceFilter, TagMatch } from './view';

/** The account's posts by reason for being in the library. */
export interface SourceSets {
  bookmarks: ReadonlySet<PostId>;
  likes: ReadonlySet<PostId>;
  tagged: ReadonlySet<PostId>;
}

export type SourceCounts = Record<SourceFilter, number>;

/**
 * Whether a post belongs to a source. Posts stored only because a saved post
 * quotes them have no source and no tags, so they belong to none.
 */
export function inSource(source: SourceFilter, sets: SourceSets): (id: PostId) => boolean {
  const saved = (id: PostId) => sets.bookmarks.has(id) || sets.likes.has(id);
  switch (source) {
    case 'all':
      return (id) => saved(id) || sets.tagged.has(id);
    case 'bookmarks':
      return (id) => sets.bookmarks.has(id);
    case 'likes':
      return (id) => sets.likes.has(id);
    case 'tagged':
      return (id) => sets.tagged.has(id) && !saved(id);
    case 'untagged':
      return (id) => saved(id) && !sets.tagged.has(id);
  }
}

/** Every post in some source. */
export function allPosts(sets: SourceSets): Set<PostId> {
  return new Set([...sets.bookmarks, ...sets.likes, ...sets.tagged]);
}

export function countSources(sets: SourceSets): SourceCounts {
  const all = [...allPosts(sets)];
  const count = (source: SourceFilter) => all.filter(inSource(source, sets)).length;
  return {
    all: all.length,
    bookmarks: sets.bookmarks.size,
    likes: sets.likes.size,
    tagged: count('tagged'),
    untagged: count('untagged'),
  };
}

/**
 * Whether a post carries the selected tags, given the posts carrying each.
 * With no tag selected, every post does.
 */
export function matchesTags(
  tagged: ReadonlyArray<ReadonlySet<PostId>>,
  match: TagMatch,
): (id: PostId) => boolean {
  if (tagged.length === 0) return () => true;
  return match === 'all'
    ? (id) => tagged.every((posts) => posts.has(id))
    : (id) => tagged.some((posts) => posts.has(id));
}

/**
 * Newest first. X's post IDs grow with time, so their numeric order is their
 * date order. They exceed what a JavaScript number holds, so they are
 * compared as decimal strings: the longer one is larger.
 */
export function comparePostDates(a: PostId, b: PostId): number {
  if (a.length !== b.length) return b.length - a.length;
  return a < b ? 1 : a > b ? -1 : 0;
}

export function byPostDate(ids: Iterable<PostId>): PostId[] {
  return [...ids].sort(comparePostDates);
}

const handles = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

/** By author handle A to Z, ignoring case, and each author's posts newest first. */
export function byAuthor(posts: ReadonlyArray<{ id: PostId; handle: string }>): PostId[] {
  return [...posts]
    .sort((a, b) => handles.compare(a.handle, b.handle) || comparePostDates(a.id, b.id))
    .map((post) => post.id);
}
