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

const REST_FILE = /^([a-z_]{1,30})\.json$/;
const ROUTE_WORD = /^[a-z_]{1,30}$/;

/**
 * A name for any API request, GraphQL or not, on any host. Used only by the
 * diagnostics build, to learn which operations and endpoints really exist.
 *
 * Non-GraphQL endpoints are named from their last one or two path segments,
 * and only when those are plain lower-case route words, so an id or a handle
 * in a path can never become part of a name.
 */
export function anyOperationFromUrl(url: URL): string | undefined {
  const graphql = ANY_GRAPHQL_PATH.exec(url.pathname)?.[1];
  if (graphql !== undefined) return graphql;

  const isApi =
    (url.host === 'x.com' && url.pathname.startsWith('/i/api/')) || url.host === 'api.x.com';
  if (!isApi) return undefined;

  const segments = url.pathname.split('/').filter(Boolean);
  const file = REST_FILE.exec(segments.at(-1) ?? '')?.[1];
  if (file === undefined) return 'Rest';
  const parent = segments.at(-2);
  return parent !== undefined && ROUTE_WORD.test(parent)
    ? `Rest_${parent}_${file}`
    : `Rest_${file}`;
}
