import type { Counts } from '@/src/db/types';
import { plural } from '@/src/library/format';

/** How many bookmarks and likes there are, and how many posts are in both. */
export function Totals({ totals, inBoth }: { totals: Counts; inBoth: number }) {
  return (
    <p class="library__totals">
      {plural(totals.bookmarks, 'bookmark')} · {plural(totals.likes, 'like')}
      {inBoth > 0 ? ` · ${inBoth.toLocaleString()} in both` : ''}
    </p>
  );
}
