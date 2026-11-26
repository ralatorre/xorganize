/**
 * Messages between the library page and its search worker. Both ends are
 * this extension's own code, but each still checks what it receives.
 */

import type { AccountId, PostId } from '@/src/db/types';
import { MAX_QUERY, type QueryToken } from './query';

/** Most terms, and most authors, in one search. */
export const MAX_TERMS = 50;

/** Page to worker: the latest search. It replaces any earlier one. */
export interface SearchRequest {
  kind: 'search';
  /** Increases with each request, so that an answer can be matched to it. */
  seq: number;
  accountId: AccountId;
  /** In searchKey form. */
  terms: string[];
  /** `@` authors, in handleKey form. */
  authors: QueryToken[];
}

/**
 * Worker to page: the posts matching a request. Sent again whenever the
 * library changes in a way that changes them.
 */
export type SearchReply =
  | { kind: 'results'; seq: number; ids: PostId[] }
  /** The library could not be read. */
  | { kind: 'failed'; seq: number };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSeq = (value: unknown): value is number => Number.isSafeInteger(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_QUERY;

const isToken = (value: unknown): value is QueryToken =>
  isRecord(value) && isText(value.value) && typeof value.prefix === 'boolean';

const isListOf = <T>(value: unknown, item: (entry: unknown) => entry is T): value is T[] =>
  Array.isArray(value) && value.length <= MAX_TERMS && value.every(item);

export function isSearchRequest(value: unknown): value is SearchRequest {
  if (!isRecord(value) || value.kind !== 'search' || !isSeq(value.seq)) return false;
  const { accountId, terms, authors } = value;
  return (
    typeof accountId === 'string' &&
    accountId !== '' &&
    isListOf(terms, isText) &&
    isListOf(authors, isToken)
  );
}

export function isSearchReply(value: unknown): value is SearchReply {
  if (!isRecord(value) || !isSeq(value.seq)) return false;
  if (value.kind === 'failed') return true;
  return (
    value.kind === 'results' &&
    Array.isArray(value.ids) &&
    value.ids.every((id) => typeof id === 'string')
  );
}
