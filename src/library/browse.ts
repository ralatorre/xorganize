/**
 * Reads what the library shows for a view: how many posts each source holds,
 * every tag with its count, and the IDs of the matching posts in order. Post
 * contents are read separately, only for the rows on screen (./posts.ts).
 */

import {
  DEFAULT_SETTINGS,
  activeAccount,
  authorsOf,
  readSettings,
  savedIds,
  sourceIds,
  taggedIds,
} from '@/src/db/repo';
import type { LibraryDatabase } from '@/src/db/schema';
import { postsWithTag, tagCounts } from '@/src/db/tags';
import type { AccountId, PostId, Settings, TagSuggestion } from '@/src/db/types';
import {
  allPosts,
  byAuthor,
  byPostDate,
  countSources,
  inSource,
  matchesTags,
  type SourceCounts,
  type SourceSets,
} from './select';
import type { View } from './view';

export interface Browse {
  /** Undefined until some account has captured something. */
  account: AccountId | undefined;
  counts: SourceCounts;
  /** Every tag, by name. */
  tags: TagSuggestion[];
  /** The view's selected tags that still exist, in the order they were selected. */
  selected: TagSuggestion[];
  /** The matching posts, in the view's order. */
  ids: PostId[];
  settings: Settings;
}

export const EMPTY_BROWSE: Browse = {
  account: undefined,
  counts: { all: 0, bookmarks: 0, likes: 0, tagged: 0, untagged: 0 },
  tags: [],
  selected: [],
  ids: [],
  settings: DEFAULT_SETTINGS,
};

export async function loadBrowse(db: LibraryDatabase, view: View): Promise<Browse> {
  const [account, settings] = await Promise.all([activeAccount(db), readSettings(db)]);
  if (account === undefined) return { ...EMPTY_BROWSE, settings };

  return db.transaction('r', db.posts, db.tags, db.postTags, async () => {
    const [bookmarks, likes, tagged, tags] = await Promise.all([
      sourceIds(db, account, 'bookmark'),
      sourceIds(db, account, 'like'),
      taggedIds(db, account),
      tagCounts(db, account),
    ]);
    const sets: SourceSets = {
      bookmarks: new Set(bookmarks),
      likes: new Set(likes),
      tagged: new Set(tagged),
    };
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    const shown: View = { ...view, tags: view.tags.filter((id) => byId.has(id)) };
    const [order, carrying] = await Promise.all([
      orderOf(db, account, shown, { bookmarks, likes, sets }),
      Promise.all(
        shown.tags.map((id) => postsWithTag(db, account, id).then((ids) => new Set(ids))),
      ),
    ]);
    const source = inSource(shown.source, sets);
    const withTags = matchesTags(carrying, shown.match);
    return {
      account,
      counts: countSources(sets),
      tags,
      selected: shown.tags.map((id) => byId.get(id)!),
      ids: order.filter((id) => source(id) && withTags(id)),
      settings,
    };
  });
}

/**
 * Every candidate post in the view's order. "Saved" is the timeline's own
 * order for bookmarks and likes, and the order posts entered the library
 * otherwise.
 */
function orderOf(
  db: LibraryDatabase,
  account: AccountId,
  view: View,
  known: { bookmarks: PostId[]; likes: PostId[]; sets: SourceSets },
): Promise<PostId[]> {
  if (view.sort === 'posted') return Promise.resolve(byPostDate(allPosts(known.sets)));
  if (view.sort === 'author') return authorsOf(db, account).then(byAuthor);
  if (view.source === 'bookmarks') return Promise.resolve(known.bookmarks);
  if (view.source === 'likes') return Promise.resolve(known.likes);
  return savedIds(db, account);
}
