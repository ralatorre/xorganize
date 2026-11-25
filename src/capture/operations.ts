/**
 * The x.com GraphQL operations the extension cares about.
 *
 * These names come from observed behaviour of an undocumented API and are
 * expected to change. This file is the one place to update them.
 */

export type SourceKind = 'bookmark' | 'like';

/** Timelines whose posts are stored. */
export const SOURCE_TIMELINES: Readonly<Record<string, SourceKind>> = {
  Bookmarks: 'bookmark',
  BookmarkSearchTimeline: 'bookmark',
  Likes: 'like',
};

/** Timelines whose posts are only remembered briefly, so a later tag has full data. */
export const AMBIENT_TIMELINES: readonly string[] = [
  'HomeTimeline',
  'HomeLatestTimeline',
  'TweetDetail',
  'UserTweets',
  'UserTweetsAndReplies',
  'UserMedia',
  'SearchTimeline',
  'ListLatestTweetsTimeline',
];

/** Requests that add or remove a source. */
export const MUTATIONS: Readonly<Record<string, { source: SourceKind; added: boolean }>> = {
  CreateBookmark: { source: 'bookmark', added: true },
  DeleteBookmark: { source: 'bookmark', added: false },
  FavoriteTweet: { source: 'like', added: true },
  UnfavoriteTweet: { source: 'like', added: false },
};

export function isKnownOperation(op: string): boolean {
  return (
    Object.hasOwn(SOURCE_TIMELINES, op) ||
    Object.hasOwn(MUTATIONS, op) ||
    AMBIENT_TIMELINES.includes(op)
  );
}

const X_GRAPHQL_PATH = /^\/i\/api\/graphql\/[A-Za-z0-9_-]+\/([A-Za-z0-9_]{1,64})$/;
const ANY_GRAPHQL_PATH = /\/graphql\/[A-Za-z0-9_-]+\/([A-Za-z0-9_]{1,64})$/;

/** The operation name, if `url` is one of the operations above on x.com itself. */
export function knownOperationFromUrl(url: URL): string | undefined {
  if (url.protocol !== 'https:' || url.host !== 'x.com') return undefined;
  const op = X_GRAPHQL_PATH.exec(url.pathname)?.[1];
  return op !== undefined && isKnownOperation(op) ? op : undefined;
}

/**
 * The operation name for any GraphQL-looking URL on any host. Used only by
 * the diagnostics build, to learn which operations and hosts really exist.
 */
export function anyOperationFromUrl(url: URL): string | undefined {
  return ANY_GRAPHQL_PATH.exec(url.pathname)?.[1];
}
