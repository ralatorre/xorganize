import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';

/**
 * The latest result of `query`, re-run whenever the data it read changes,
 * including changes written by other contexts such as the worker. Undefined
 * until the first result arrives, and `fallback` if the query fails.
 */
export function useLiveQuery<T>(query: () => Promise<T>, fallback: T): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: setValue,
      error: () => setValue(fallback),
    });
    return () => subscription.unsubscribe();
  }, [query, fallback]);
  return value;
}
