/**
 * What the library shows, in two steps.
 *
 * 1. `loadCatalogue` reads which posts are in each source and in what order,
 *    and every tag with the posts carrying it, from the indexes alone. Reading
 *    them takes the better part of a second at 50,000 posts, so it is done
 *    once each time the library changes, not each time the view does.
 * 2. `browseView` works out from the catalogue which posts a view shows, in
 *    memory, in milliseconds.
 *
 * Post contents are read separately, only for the rows on screen
 * (./posts.ts). Text and authors are searched in a worker (src/search/),
 * which hands over its matches.
 */

import {
  DEFAULT_SETTINGS,
  activeAccount,
  authorsOf,
  backupTimes,
  readSettings,
  savedIds,
  sourceIds,
  taggedIds,
} from '@/src/db/repo';
import type { LibraryDatabase } from '@/src/db/schema';
import { tagIndex } from '@/src/db/tags';
import type {
  AccountId,
  BackupTimes,
  PostId,
  Settings,
  TagId,
  TagSuggestion,
} from '@/src/db/types';
import { matchesToken, parseQuery } from '@/src/search/query';
import { tagKey } from '@/src/tags/names';
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

/** The library's contents by source and tag, as IDs. */
export interface Catalogue {
  /** Undefined until some account has captured something. */
  account: AccountId | undefined;
  settings: Settings;
  /** Each timeline's posts in its own order, newest first. */
  bookmarks: readonly PostId[];
  likes: readonly PostId[];
  /** Every stored post, newest in the library first. */
  saved: readonly PostId[];
  sets: SourceSets;
  counts: SourceCounts;
  /** Every tag, by name, with its count. */
  tags: readonly TagSuggestion[];
  /** The posts carrying each tag. */
  tagged: ReadonlyMap<TagId, ReadonlySet<PostId>>;
  /** What the backup reminder counts from. */
  backup: BackupTimes;
}

const NO_SETS: SourceSets = { bookmarks: new Set(), likes: new Set(), tagged: new Set() };

export const EMPTY_CATALOGUE: Catalogue = {
  account: undefined,
  settings: DEFAULT_SETTINGS,
  bookmarks: [],
  likes: [],
  saved: [],
  sets: NO_SETS,
  counts: countSources(NO_SETS),
  tags: [],
  tagged: new Map(),
  backup: {},
};

export async function loadCatalogue(db: LibraryDatabase): Promise<Catalogue> {
  const [account, settings] = await Promise.all([activeAccount(db), readSettings(db)]);
  if (account === undefined) return { ...EMPTY_CATALOGUE, settings };

  return db.transaction('r', db.posts, db.tags, db.postTags, db.meta, async () => {
    const [bookmarks, likes, tagged, saved, tags, backup] = await Promise.all([
      sourceIds(db, account, 'bookmark'),
      sourceIds(db, account, 'like'),
      taggedIds(db, account),
      savedIds(db, account),
      tagIndex(db, account),
      backupTimes(db, account),
    ]);
    const sets: SourceSets = {
      bookmarks: new Set(bookmarks),
      likes: new Set(likes),
      tagged: new Set(tagged),
    };
    return {
      account,
      settings,
      bookmarks,
      likes,
      saved,
      sets,
      counts: countSources(sets),
      tags: tags.tags,
      tagged: tags.posts,
      backup,
    };
  });
}

/**
 * Every post by author, for the Author order. Read only while that order is
 * chosen: the handles come from the index one entry at a time.
 */
export async function loadAuthorOrder(
  db: LibraryDatabase,
  accountId: AccountId,
): Promise<PostId[]> {
  return byAuthor(await authorsOf(db, accountId));
}

/** What the library shows for a view. */
export interface Browse {
  account: AccountId | undefined;
  counts: SourceCounts;
  /** Every tag, by name. */
  tags: readonly TagSuggestion[];
  /** The view's selected tags that still exist, in the order they were selected. */
  selected: TagSuggestion[];
  /** The matching posts, in the view's order. */
  ids: PostId[];
  settings: Settings;
}

/** What the view needs beyond the catalogue. */
export interface Found {
  /**
   * The posts matching the query's text and `@` authors, from the search
   * worker. Leave it out when the query has neither.
   */
  matches?: ReadonlySet<PostId>;
  /** Every post by author (`loadAuthorOrder`). Until it is read, the saved order stands in. */
  byAuthor?: readonly PostId[];
}

export function browseView(catalogue: Catalogue, view: View, found: Found = {}): Browse {
  const { tags, tagged, sets } = catalogue;
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  const shown = view.tags.filter((id) => byId.has(id));
  const carrying = (ids: readonly TagId[]) =>
    new Set(ids.flatMap((id) => [...(tagged.get(id) ?? [])]));

  const source = inSource(view.source, sets);
  const withTags = matchesTags(
    shown.map((id) => carrying([id])),
    view.match,
  );
  const withQueryTags = matchesTags(queryTags(view.query, tags).map(carrying), 'all');
  const { matches } = found;
  const show = (id: PostId) =>
    source(id) && withTags(id) && withQueryTags(id) && (matches === undefined || matches.has(id));

  return {
    account: catalogue.account,
    counts: catalogue.counts,
    tags,
    selected: shown.map((id) => byId.get(id)!),
    ids: orderOf(catalogue, view, found).filter(show),
    settings: catalogue.settings,
  };
}

/** For each `#` in the query, the tags it names. A post must carry one of each. */
function queryTags(query: string, tags: readonly TagSuggestion[]): TagId[][] {
  return parseQuery(query).tags.map((token) =>
    tags.filter((tag) => matchesToken(token, tagKey(tag.name))).map((tag) => tag.id),
  );
}

/**
 * Every candidate post in the view's order. "Saved" is the timeline's own
 * order for bookmarks and likes, and the order posts entered the library
 * otherwise.
 */
function orderOf(catalogue: Catalogue, view: View, found: Found): readonly PostId[] {
  if (view.sort === 'posted') return byPostDate(allPosts(catalogue.sets));
  if (view.sort === 'author' && found.byAuthor) return found.byAuthor;
  if (view.source === 'bookmarks') return catalogue.bookmarks;
  if (view.source === 'likes') return catalogue.likes;
  return catalogue.saved;
}
