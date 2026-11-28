/**
 * What the list's toolbar and its empty state say (DESIGN, 4.5): the view's
 * title, the orders on offer, and why nothing matches.
 */

import type { SortOrder, SourceFilter } from './view';

/** What each source is called, in the sidebar, as pills and as the view's title. */
export const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All posts',
  bookmarks: 'Bookmarks',
  likes: 'Likes',
  tagged: 'Tagged only',
  untagged: 'Untagged',
};

/** The Sort menu: each order, and a second line on what it means. */
export const SORT_LABELS: Record<SortOrder, { label: string; detail: string }> = {
  saved: { label: 'Date saved', detail: 'Newest first; X’s own order for Bookmarks and Likes' },
  posted: { label: 'Date posted', detail: 'Newest first' },
  author: { label: 'Author', detail: 'A to Z' },
};

/** Under the Untagged view's title: it is the inbox for triage. */
export const UNTAGGED_HINT = 'Bookmarked or liked, with no tag yet. Tag them to clear this list.';

/** The view's title: the tag, when one tag is chosen among all posts, or else the source. */
export function viewTitle(source: SourceFilter, tags: ReadonlyArray<{ name: string }>): string {
  const [only, ...others] = tags;
  return source === 'all' && only && others.length === 0 ? only.name : SOURCE_LABELS[source];
}

/** Why nothing is listed, naming the source and what was searched for. */
export function noMatchLine(source: SourceFilter, query: string, tags: number): string {
  const searched = query.trim();
  const what = searched === '' ? 'these filters' : `“${searched}”`;
  const withTags = searched !== '' && tags > 0 ? ' with these tags' : '';
  return `Nothing in ${SOURCE_LABELS[source]} matches ${what}${withTags}.`;
}
