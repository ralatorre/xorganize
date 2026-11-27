import type { ComponentChildren } from 'preact';
import { SORT_ORDERS, type SortOrder } from '@/src/library/view';
import { Select } from './Select';

const LABELS: Record<SortOrder, string> = {
  saved: 'Saved (newest)',
  posted: 'Post date (newest)',
  author: 'Author (A to Z)',
};

/**
 * How many posts match, or how the search is going, and the order they are
 * in. `children` go beside the order: the view's export.
 */
export function ViewSummary(props: {
  status: string;
  sort: SortOrder;
  onSort(sort: SortOrder): void;
  children?: ComponentChildren;
}) {
  return (
    <div class="summary">
      <p class="summary__count" role="status">
        {props.status}
      </p>
      <label class="summary__sort">
        Sort:{' '}
        <Select
          value={props.sort}
          onChange={(event) => {
            const chosen = SORT_ORDERS.find((order) => order === event.currentTarget.value);
            if (chosen) props.onSort(chosen);
          }}
        >
          {SORT_ORDERS.map((order) => (
            <option key={order} value={order}>
              {LABELS[order]}
            </option>
          ))}
        </Select>
      </label>
      {props.children}
    </div>
  );
}
