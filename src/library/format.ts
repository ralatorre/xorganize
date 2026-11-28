/** How numbers, dates and names are written in the library. */

import type { StoredPost } from '@/src/db/types';
import type { TextSearch } from '@/src/search/client';

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

export function formatDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The notes in a card's footer (DESIGN, 4.5): media not shown, a post X no
 * longer serves, and a source it has left while it stays for another reason.
 */
export function postLabels(
  post: Pick<
    StoredPost,
    'media' | 'unavailable' | 'isBookmark' | 'isLike' | 'unbookmarkedAt' | 'unlikedAt'
  >,
  shown: number,
): string[] {
  const hidden = post.media.length > shown ? [plural(post.media.length, 'attachment')] : [];
  return [
    ...hidden,
    ...(post.unavailable ? ['Unavailable on X'] : []),
    ...(!post.isBookmark && post.unbookmarkedAt !== undefined ? ['No longer bookmarked'] : []),
    ...(!post.isLike && post.unlikedAt !== undefined ? ['No longer liked'] : []),
  ];
}

/** A post's date as X writes it on a card: the year only when it is not this one (DESIGN, 4.5). */
export function postDate(time: number, now: number): string {
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Date(time).toLocaleDateString(undefined, {
    ...(sameYear ? {} : { year: 'numeric' }),
    month: 'short',
    day: 'numeric',
  });
}

/** The first character of a name, for an avatar placeholder. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

export const SEARCHING = 'Searching…';
export const SEARCH_FAILED = 'Search is unavailable. Reload the page to try again.';

/** The summary line: how many posts match, or how the text search is going. */
export function summaryOf(search: TextSearch, count: number): string {
  if (search.state === 'pending') return SEARCHING;
  if (search.state === 'failed') return SEARCH_FAILED;
  return plural(count, 'post');
}
