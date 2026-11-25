/**
 * The tags of the posts on screen, as this tab knows them. Requests for posts
 * that appear together are batched into one message to the worker.
 */

import type { TagSummary } from '@/src/db/types';
import { MAX_TAG_POSTS } from '@/src/messaging/protocol';

export type TagListener = (tags: TagSummary[]) => void;

export interface TagStateDependencies {
  /** Asks the worker. Undefined when it could not answer. */
  fetch(postIds: string[]): Promise<Map<string, TagSummary[]> | undefined>;
  /** Runs `task` soon, once, so that several requests can be gathered. */
  schedule(task: () => void): void;
  batchSize?: number;
}

export interface TagState {
  /** Calls `listener` with the post's tags now, if known, and whenever they change. */
  watch(postId: string, listener: TagListener): () => void;
  get(postId: string): TagSummary[] | undefined;
  set(postId: string, tags: TagSummary[]): void;
  /** Asks again for every watched post, after changes may have been missed. */
  refresh(): void;
}

export function createTagState(deps: TagStateDependencies): TagState {
  const batchSize = deps.batchSize ?? MAX_TAG_POSTS;
  const known = new Map<string, TagSummary[]>();
  const listeners = new Map<string, Set<TagListener>>();
  const wanted = new Set<string>();
  let scheduled = false;

  const set = (postId: string, tags: TagSummary[]) => {
    if (!listeners.has(postId)) return; // nobody is showing it
    known.set(postId, tags);
    for (const listener of listeners.get(postId) ?? []) listener(tags);
  };

  const flush = () => {
    scheduled = false;
    const ids = [...wanted];
    wanted.clear();
    for (let start = 0; start < ids.length; start += batchSize) {
      const batch = ids.slice(start, start + batchSize);
      void deps.fetch(batch).then(
        (found) => {
          for (const [postId, tags] of found ?? []) set(postId, tags);
        },
        () => {},
      );
    }
  };

  const request = (postId: string) => {
    wanted.add(postId);
    if (scheduled) return;
    scheduled = true;
    deps.schedule(flush);
  };

  return {
    watch(postId, listener) {
      let group = listeners.get(postId);
      if (!group) listeners.set(postId, (group = new Set()));
      group.add(listener);
      const tags = known.get(postId);
      if (tags) listener(tags);
      else request(postId);
      return () => {
        group.delete(listener);
        if (group.size > 0) return;
        listeners.delete(postId);
        known.delete(postId);
      };
    },
    get: (postId) => known.get(postId),
    set,
    refresh() {
      for (const postId of listeners.keys()) request(postId);
    },
  };
}
