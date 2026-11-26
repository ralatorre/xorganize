/** How numbers, dates and names are written in the library. */

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
