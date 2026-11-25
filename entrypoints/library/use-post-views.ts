import { useCallback } from 'preact/hooks';
import type { AccountId, PostId } from '@/src/db/types';
import { pageSpan } from '@/src/library/paging';
import { NO_POSTS, type PostView } from '@/src/library/posts';
import { useLiveQuery } from './use-live-query';

export type LoadPosts = (
  accountId: AccountId,
  ids: readonly PostId[],
) => Promise<ReadonlyMap<PostId, PostView>>;

/**
 * The cards for rows `first` to `last`, read a page at a time and kept up to
 * date. While a new page loads, the previous result is kept.
 */
export function usePostViews(
  load: LoadPosts,
  accountId: AccountId,
  ids: readonly PostId[],
  first: number,
  last: number,
): ReadonlyMap<PostId, PostView> {
  const { start, end } = pageSpan(first, last, ids.length);
  const wanted = ids.slice(start, end).join(' ');
  const query = useCallback(
    () => load(accountId, wanted === '' ? [] : wanted.split(' ')),
    [load, accountId, wanted],
  );
  return useLiveQuery(query, NO_POSTS) ?? NO_POSTS;
}
