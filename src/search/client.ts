/**
 * The library page's side of search: sends the latest search to the worker
 * and passes on the answers to it, ignoring answers to earlier ones.
 */

import type { AccountId, PostId } from '@/src/db/types';
import { isSearchReply, type SearchRequest } from './protocol';
import type { SearchQuery } from './query';

/** The part of a query the worker answers. */
export type WorkerQuery = Pick<SearchQuery, 'terms' | 'authors'>;

/** What the worker answered. */
export type SearchOutcome = { state: 'done'; ids: ReadonlySet<PostId> } | { state: 'failed' };

/** Nothing to search for, a search under way, or its latest answer. */
export type TextSearch = { state: 'none' } | { state: 'pending' } | SearchOutcome;

/** The worker, as the page sees it. */
export interface SearchPort {
  postMessage(message: SearchRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface SearchClient {
  /**
   * Searches the account's posts for those containing every term, by one of
   * the authors if any are given. `onResults` is called with the answer, and
   * again whenever the library changes it, until the returned function is
   * called or another search starts.
   */
  search(
    accountId: AccountId,
    query: WorkerQuery,
    onResults: (outcome: SearchOutcome) => void,
  ): () => void;
}

export function createSearchClient(port: SearchPort): SearchClient {
  let seq = 0;
  let current: { seq: number; onResults: (outcome: SearchOutcome) => void } | undefined;

  port.addEventListener('message', (event) => {
    const reply: unknown = event.data;
    if (!isSearchReply(reply) || reply.seq !== current?.seq) return;
    current.onResults(
      reply.kind === 'results' ? { state: 'done', ids: new Set(reply.ids) } : { state: 'failed' },
    );
  });

  return {
    search(accountId, query, onResults) {
      seq += 1;
      const mine = { seq, onResults };
      current = mine;
      port.postMessage({
        kind: 'search',
        seq,
        accountId,
        terms: [...query.terms],
        authors: query.authors.map((author) => ({ ...author })),
      });
      return () => {
        if (current === mine) current = undefined;
      };
    },
  };
}
