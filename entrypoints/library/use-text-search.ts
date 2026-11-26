import { useEffect, useState } from 'preact/hooks';
import type { AccountId } from '@/src/db/types';
import type { SearchClient, TextSearch, WorkerQuery } from '@/src/search/client';

const NONE: TextSearch = { state: 'none' };
const PENDING: TextSearch = { state: 'pending' };

/**
 * The account's posts matching the query's text and authors, kept current as
 * the library changes. While a new search runs, the previous answer stays,
 * so results do not blink as the user types.
 */
export function useTextSearch(
  client: SearchClient,
  accountId: AccountId | undefined,
  query: WorkerQuery,
): TextSearch {
  const [result, setResult] = useState<{ account: AccountId; outcome: TextSearch }>();
  // The query arrives as a new object each render; its text form changes only with it.
  const empty = query.terms.length === 0 && query.authors.length === 0;
  const key = empty ? '' : JSON.stringify({ terms: query.terms, authors: query.authors });

  useEffect(() => {
    if (accountId === undefined || key === '') return;
    return client.search(accountId, JSON.parse(key) as WorkerQuery, (outcome) =>
      setResult({ account: accountId, outcome }),
    );
  }, [client, accountId, key]);

  if (accountId === undefined || key === '') return NONE;
  if (result?.account !== accountId) return PENDING;
  return result.outcome;
}
