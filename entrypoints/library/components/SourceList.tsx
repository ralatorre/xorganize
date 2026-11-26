import { SOURCE_FILTERS, type SourceFilter } from '@/src/library/view';
import type { SourceCounts } from '@/src/library/select';

const LABELS: Record<SourceFilter, string> = {
  all: 'All',
  bookmarks: 'Bookmarks',
  likes: 'Likes',
  tagged: 'Tagged only',
  untagged: 'Untagged',
};

/** The sources, with how many posts each holds. Exactly one is selected. */
export function SourceList(props: {
  counts: SourceCounts;
  selected: SourceFilter;
  onSelect(source: SourceFilter): void;
}) {
  return (
    <section class="sidebar__section" aria-labelledby="sources-title">
      <h2 id="sources-title">Sources</h2>
      <ul>
        {SOURCE_FILTERS.map((source) => (
          <li key={source}>
            <button
              type="button"
              class="sidebar__item"
              aria-pressed={source === props.selected}
              onClick={() => props.onSelect(source)}
            >
              <span class="sidebar__label">{LABELS[source]}</span>{' '}
              <span class="sidebar__count">{props.counts[source].toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
