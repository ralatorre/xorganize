/**
 * Finds the posts in a timeline response.
 *
 * It walks the whole response instead of following one fixed path, so that a
 * change to the outer structure does not stop capture. What it relies on:
 * timeline entries have `entryId` and `sortIndex`, and a post sits under a
 * `tweet_results`, `quoted_status_result` or `retweeted_status_result` key.
 */

import { isRecord } from '@/src/guards';
import { normalisePost, type CapturedPost } from './normalise';

export interface TimelinePost {
  post: CapturedPost;
  /** The entry's position in the timeline, as a decimal string. */
  sortIndex: string;
}

export interface Extracted {
  /** Posts that are entries of the timeline itself, in the order they appear. */
  entries: TimelinePost[];
  /** Posts found inside others (quoted, reposted) or inside grouped entries. */
  nested: CapturedPost[];
  /** Ids of timeline entries whose post is no longer available. */
  unavailable: string[];
}

const RESULT_KEYS = new Set(['tweet_results', 'quoted_status_result', 'retweeted_status_result']);
const GONE = new Set(['TweetTombstone', 'TweetUnavailable']);
const SORT_INDEX = /^\d{1,30}$/;
const POST_ENTRY = /^tweet-(\d{1,25})$/;
const MAX_NODES = 400_000;
const MAX_DEPTH = 64;

interface Entry {
  entryId: string;
  sortIndex: string;
  promoted: boolean;
  /** The object that holds this entry's own post, if it has one. */
  holder: unknown;
}

export function extractPosts(body: unknown): Extracted {
  const entries = new Map<string, TimelinePost>();
  const nested = new Map<string, CapturedPost>();
  const unavailable = new Set<string>();
  let nodes = 0;

  const collect = (key: string, holder: Record<string, unknown>, entry: Entry | undefined) => {
    const results = holder[key];
    if (!isRecord(results) || !isRecord(results.result)) return;
    if (entry?.promoted || isRecord(holder.promotedMetadata)) return;

    const own = key === 'tweet_results' && entry !== undefined && entry.holder === holder;

    if (typeof results.result.__typename === 'string' && GONE.has(results.result.__typename)) {
      const id = own ? POST_ENTRY.exec(entry.entryId)?.[1] : undefined;
      if (id !== undefined) unavailable.add(id);
      return;
    }

    const post = normalisePost(results.result);
    if (!post) return;
    if (own && SORT_INDEX.test(entry.sortIndex)) {
      if (!entries.has(post.id)) entries.set(post.id, { post, sortIndex: entry.sortIndex });
    } else if (!nested.has(post.id)) {
      nested.set(post.id, post);
    }
  };

  const walk = (node: unknown, entry: Entry | undefined, depth: number) => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, entry, depth + 1);
      return;
    }
    if (!isRecord(node)) return;

    let current = entry;
    if (typeof node.entryId === 'string' && typeof node.sortIndex === 'string') {
      current = {
        entryId: node.entryId,
        sortIndex: node.sortIndex,
        promoted: node.entryId.startsWith('promoted'),
        holder: isRecord(node.content) ? node.content.itemContent : undefined,
      };
    }
    for (const key of Object.keys(node)) {
      if (RESULT_KEYS.has(key)) collect(key, node, current);
      walk(node[key], current, depth + 1);
    }
  };

  walk(body, undefined, 0);

  // A post that is an entry in its own right is not also listed as nested.
  for (const id of entries.keys()) nested.delete(id);
  return {
    entries: [...entries.values()],
    nested: [...nested.values()],
    unavailable: [...unavailable],
  };
}
