/**
 * Describes the structure of a JSON value without recording its content.
 *
 * Used by the diagnostics build to check the project's assumptions about
 * x.com's responses against real traffic. The output is safe to share: it
 * holds key names and value types, never values, with two narrow exceptions
 * that carry schema information rather than personal data:
 *
 * - values of a few schema keys such as `__typename`, and only when they look
 *   like an identifier;
 * - timeline entry ids, reduced to a pattern of known words and placeholders.
 */

import { isRecord } from '@/src/messaging/protocol';

export interface ShapeSummary {
  /** Key path -> sorted type names seen there. */
  paths: Record<string, string[]>;
  /** Key path -> sorted identifier-like values, for schema keys only. */
  enums: Record<string, string[]>;
  /** True when a limit was hit and the description is incomplete. */
  truncated: boolean;
}

export interface TimelineStats {
  entries: number;
  entryIdPatterns: string[];
  tweetResults: number;
  /** Entries that hold a post, as opposed to cursors and modules. */
  postEntries: number;
  /** Whether the post entries' sort indexes run from high to low; null with fewer than two. */
  postSortIndexDescending: boolean | null;
  /** How many post entries use the post's own id as their sort index. */
  sortIndexIsPostId: number;
  /** The viewer's own state on the posts seen, as counts. */
  bookmarked: YesNo;
  favorited: YesNo;
}

export interface YesNo {
  yes: number;
  no: number;
}

const MAX_PATHS = 4000;
const MAX_NODES = 250_000;
const MAX_DEPTH = 48;
const MAX_ENUM_VALUES = 40;

const SAFE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const SCHEMA_KEYS = new Set([
  '__typename',
  'type',
  'entryType',
  'itemType',
  'cursorType',
  'displayType',
]);

/** Words that may appear verbatim in an entry-id pattern. Anything else becomes a placeholder. */
const ENTRY_ID_WORDS = new Set([
  'bookmark',
  'bookmarks',
  'bottom',
  'community',
  'conversation',
  'conversationthread',
  'cursor',
  'follow',
  'grid',
  'home',
  'item',
  'label',
  'list',
  'messageprompt',
  'module',
  'profile',
  'promoted',
  'relatedtweets',
  'search',
  'showmore',
  'stream',
  'thread',
  'threads',
  'timeline',
  'to',
  'tombstone',
  'top',
  'trend',
  'trends',
  'tweet',
  'user',
  'who',
]);

export function describeShape(value: unknown): ShapeSummary {
  const paths = new Map<string, Set<string>>();
  const enums = new Map<string, Set<string>>();
  let nodes = 0;
  let truncated = false;

  const add = (map: Map<string, Set<string>>, path: string, entry: string) => {
    let set = map.get(path);
    if (!set) {
      if (map.size >= MAX_PATHS) {
        truncated = true;
        return;
      }
      set = new Set();
      map.set(path, set);
    }
    set.add(entry);
  };

  const walk = (node: unknown, path: string, depth: number) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    if (Array.isArray(node)) {
      add(paths, path, node.length === 0 ? 'array(empty)' : 'array');
      for (const item of node) walk(item, `${path}[]`, depth + 1);
    } else if (isRecord(node)) {
      const keys = Object.keys(node);
      if (keys.length === 0) add(paths, path, 'object(empty)');
      for (const key of keys) {
        const child = node[key];
        const childPath = `${path}.${SAFE_KEY.test(key) ? key : '<key>'}`;
        if (SCHEMA_KEYS.has(key) && typeof child === 'string' && IDENTIFIER.test(child)) {
          const seen = enums.get(childPath);
          if (!seen || seen.size < MAX_ENUM_VALUES) add(enums, childPath, child);
        }
        walk(child, childPath, depth + 1);
      }
    } else {
      add(paths, path, node === null ? 'null' : typeof node);
    }
  };

  walk(value, '', 0);
  return { paths: toRecord(paths), enums: toRecord(enums), truncated };
}

/** Key paths only, for request variables and bodies. */
export function describeKeys(value: unknown): string[] {
  return Object.keys(describeShape(value).paths).sort();
}

export function timelineStats(value: unknown): TimelineStats {
  const patterns = new Set<string>();
  const postSortIndexes: bigint[] = [];
  const bookmarked: YesNo = { yes: 0, no: 0 };
  const favorited: YesNo = { yes: 0, no: 0 };
  let entries = 0;
  let postEntries = 0;
  let sortIndexIsPostId = 0;
  let tweetResults = 0;
  let nodes = 0;

  const count = (tally: YesNo, flag: unknown) => {
    if (flag === true) tally.yes += 1;
    if (flag === false) tally.no += 1;
  };

  const walk = (node: unknown, depth: number) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
    } else if (isRecord(node)) {
      if (typeof node.entryId === 'string' && typeof node.sortIndex === 'string') {
        entries += 1;
        patterns.add(entryIdPattern(node.entryId));
        const post = postOfEntry(node);
        if (post) {
          postEntries += 1;
          if (/^\d{1,30}$/.test(node.sortIndex)) postSortIndexes.push(BigInt(node.sortIndex));
          if (post.rest_id === node.sortIndex) sortIndexIsPostId += 1;
        }
      }
      if (isRecord(node.tweet_results)) {
        const post = unwrapPost(node.tweet_results.result);
        if (post) {
          tweetResults += 1;
          if (isRecord(post.legacy)) {
            count(bookmarked, post.legacy.bookmarked);
            count(favorited, post.legacy.favorited);
          }
        }
      }
      for (const key of Object.keys(node)) walk(node[key], depth + 1);
    }
  };
  walk(value, 0);

  let postSortIndexDescending: boolean | null = null;
  if (postSortIndexes.length >= 2) {
    postSortIndexDescending = postSortIndexes.every(
      (index, i) => i === 0 || index < postSortIndexes[i - 1]!,
    );
  }
  return {
    entries,
    entryIdPatterns: [...patterns].sort(),
    tweetResults,
    postEntries,
    postSortIndexDescending,
    sortIndexIsPostId,
    bookmarked,
    favorited,
  };
}

/** A post result, with the visibility wrapper removed if there is one. */
function unwrapPost(result: unknown): Record<string, unknown> | undefined {
  if (!isRecord(result)) return undefined;
  return isRecord(result.tweet) ? result.tweet : result;
}

function postOfEntry(entry: Record<string, unknown>): Record<string, unknown> | undefined {
  const content = entry.content;
  if (!isRecord(content) || !isRecord(content.itemContent)) return undefined;
  const results = content.itemContent.tweet_results;
  return isRecord(results) ? unwrapPost(results.result) : undefined;
}

/** `tweet-1234567` -> `tweet-<n>`. Unknown words become `<word>`, so no handle or text can leak. */
export function entryIdPattern(entryId: string): string {
  return entryId
    .slice(0, 80)
    .toLowerCase()
    .split('-')
    .map((part) => {
      if (part === '') return '';
      if (/^\d+$/.test(part)) return '<n>';
      if (ENTRY_ID_WORDS.has(part)) return part;
      return '<word>';
    })
    .join('-');
}

function toRecord(map: Map<string, Set<string>>): Record<string, string[]> {
  const record: Record<string, string[]> = {};
  for (const key of [...map.keys()].sort()) record[key] = [...map.get(key)!].sort();
  return record;
}
