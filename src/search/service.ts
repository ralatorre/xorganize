/**
 * The search worker's work: hold the searchable text of the account's posts,
 * keep it current, and answer the page's searches (SPEC, 11).
 *
 * The library is read a page at a time. After that, only the posts stored
 * from X since the last read are read again, along with the list of IDs so
 * that removed posts are dropped. Each time the library changes, the latest
 * search is answered again if its results may have changed.
 */

import { postChanges, postsAfter, type PostChanges } from '@/src/db/repo';
import type { LibraryDatabase } from '@/src/db/schema';
import type { AccountId } from '@/src/db/types';
import { isSearchRequest, type SearchReply, type SearchRequest } from './protocol';
import { TextIndex } from './text-index';

/** Posts read at a time while building. */
export const BUILD_PAGE = 1000;

export interface SearchServiceDeps {
  db: LibraryDatabase;
  /**
   * Runs `query` now and again whenever the data it read changes, passing
   * each result to `next`. Returns a function that stops it. Dexie's
   * `liveQuery` in the worker.
   */
  watch<T>(query: () => Promise<T>, next: (value: T) => void, error: () => void): () => void;
  reply(message: SearchReply): void;
  now?: () => number;
  pageSize?: number;
}

export interface SearchService {
  /** Handles a message from the page. Anything but a search request is ignored. */
  receive(message: unknown): void;
  /** Stops watching the library. */
  stop(): void;
}

interface Session {
  accountId: AccountId;
  index: TextIndex;
  ready: boolean;
  failed: boolean;
  stopWatching?: () => void;
}

export function createSearchService(deps: SearchServiceDeps): SearchService {
  const { db, watch, reply } = deps;
  const now = deps.now ?? Date.now;
  const pageSize = deps.pageSize ?? BUILD_PAGE;
  let session: Session | undefined;
  let latest: SearchRequest | undefined;

  const answer = () => {
    if (!session || !latest || latest.accountId !== session.accountId) return;
    if (session.failed) reply({ kind: 'failed', seq: latest.seq });
    else if (session.ready)
      reply({
        kind: 'results',
        seq: latest.seq,
        ids: session.index.match(latest.terms, latest.authors),
      });
  };

  const fail = (current: Session) => {
    if (session !== current) return;
    current.failed = true;
    current.stopWatching?.();
    answer();
  };

  const start = (accountId: AccountId) => {
    session?.stopWatching?.();
    const current: Session = { accountId, index: new TextIndex(), ready: false, failed: false };
    session = current;
    void build(current).catch(() => fail(current));
  };

  const build = async (current: Session) => {
    // Changes stored while the pages are read are picked up from here on.
    let since = now();
    let after = '';
    for (;;) {
      const page = await postsAfter(db, current.accountId, after, pageSize);
      if (session !== current) return;
      for (const post of page) current.index.put(post);
      if (page.length < pageSize) break;
      after = page[page.length - 1]!.id;
    }

    current.stopWatching = watch(
      () => postChanges(db, current.accountId, since),
      (changes: PostChanges) => {
        if (session !== current) return;
        const dropped = current.index.keepOnly(changes.ids);
        let changed = false;
        for (const post of changes.changed) {
          changed = current.index.put(post) || changed;
          since = Math.max(since, post.lastSeenAt);
        }
        const first = !current.ready;
        current.ready = true;
        if (first || dropped || changed) answer();
      },
      () => fail(current),
    );
  };

  return {
    receive(message) {
      if (!isSearchRequest(message)) return;
      latest = message;
      if (session?.accountId !== message.accountId) start(message.accountId);
      else answer();
    },
    stop() {
      session?.stopWatching?.();
      session = undefined;
    },
  };
}
