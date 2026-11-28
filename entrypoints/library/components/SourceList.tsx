import type { SourceCounts } from '@/src/library/select';
import type { SourceFilter } from '@/src/library/view';
import { SOURCE_FILTERS } from '@/src/library/view';
import { Icon } from './Icon';
import { SOURCE_LABELS } from '@/src/library/toolbar';
import { SOURCE_ICONS } from './source-icons';

/** The sources, each with its icon and how many posts it holds. Exactly one is selected. */
export function SourceList(props: {
  counts: SourceCounts;
  selected: SourceFilter;
  onSelect(source: SourceFilter): void;
}) {
  return (
    <section class="sidebar__section" aria-labelledby="sources-title">
      <h2 id="sources-title" class="visually-hidden">
        Sources
      </h2>
      <ul>
        {SOURCE_FILTERS.map((source) => (
          <li key={source}>
            <button
              type="button"
              class="sidebar__item"
              aria-pressed={source === props.selected}
              onClick={() => props.onSelect(source)}
            >
              <Icon name={SOURCE_ICONS[source]} />
              <span class="sidebar__label">{SOURCE_LABELS[source]}</span>{' '}
              <span class="sidebar__count">{props.counts[source].toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
