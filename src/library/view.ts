/**
 * What the library is showing (DESIGN, 4.5): which source, which tags and how
 * they combine, what was searched for, and in what order. Changes to it are
 * pure, so the page holds no filtering rules of its own.
 */

import type { TagId } from '@/src/db/types';
import { MAX_QUERY } from '@/src/search/query';

/** The sidebar's sources. They are exclusive: exactly one is selected. */
export const SOURCE_FILTERS = ['all', 'bookmarks', 'likes', 'tagged', 'untagged'] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export const SORT_ORDERS = ['saved', 'posted', 'author'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Whether a post needs every selected tag, or any one of them. */
export type TagMatch = 'all' | 'any';

export interface View {
  source: SourceFilter;
  /** Selected tags, in the order they were selected. */
  tags: readonly TagId[];
  match: TagMatch;
  /** What is typed in the search box, as typed (src/search/query.ts). */
  query: string;
  sort: SortOrder;
}

export const DEFAULT_VIEW: View = {
  source: 'all',
  tags: [],
  match: 'all',
  query: '',
  sort: 'saved',
};

export type ViewChange =
  | { type: 'source'; source: SourceFilter }
  /** A tag clicked in the sidebar. `add` is Ctrl or Cmd held: add to the selection. */
  | { type: 'tag'; tagId: TagId; add: boolean }
  /** A group clicked in the sidebar: every tag in it, matching any. */
  | { type: 'group'; tagIds: readonly TagId[] }
  | { type: 'untag'; tagId: TagId }
  | { type: 'match'; match: TagMatch }
  | { type: 'query'; query: string }
  | { type: 'sort'; sort: SortOrder }
  /** Back to every post, with nothing searched for, keeping the order. */
  | { type: 'clear' };

export function changeView(view: View, change: ViewChange): View {
  switch (change.type) {
    case 'source':
      return { ...view, source: change.source };
    case 'tag':
      return { ...view, tags: pickTag(view.tags, change.tagId, change.add) };
    case 'group':
      return groupChosen(view, change.tagIds)
        ? { ...view, tags: [] }
        : { ...view, tags: [...change.tagIds], match: 'any' };
    case 'untag':
      return { ...view, tags: view.tags.filter((id) => id !== change.tagId) };
    case 'match':
      return { ...view, match: change.match };
    case 'query':
      return { ...view, query: change.query.slice(0, MAX_QUERY) };
    case 'sort':
      return { ...view, sort: change.sort };
    case 'clear':
      return {
        ...view,
        source: DEFAULT_VIEW.source,
        tags: DEFAULT_VIEW.tags,
        query: DEFAULT_VIEW.query,
      };
  }
}

/**
 * A plain click shows only that tag, or clears it when it was the only one
 * shown. Adding toggles the tag in or out of the selection.
 */
function pickTag(tags: readonly TagId[], tagId: TagId, add: boolean): readonly TagId[] {
  if (add) return tags.includes(tagId) ? tags.filter((id) => id !== tagId) : [...tags, tagId];
  return tags.length === 1 && tags[0] === tagId ? [] : [tagId];
}

/**
 * True while the view shows a group: exactly its tags, matching any. Clicking
 * the group again then clears them, as for a tag.
 */
export function groupChosen(view: View, tagIds: readonly TagId[]): boolean {
  if (tagIds.length === 0 || view.tags.length !== tagIds.length) return false;
  if (tagIds.length > 1 && view.match !== 'any') return false;
  const chosen = new Set(view.tags);
  return tagIds.every((id) => chosen.has(id));
}

/** True when the view hides some posts. */
export function isFiltered(view: View): boolean {
  return view.source !== DEFAULT_VIEW.source || view.tags.length > 0 || view.query.trim() !== '';
}
