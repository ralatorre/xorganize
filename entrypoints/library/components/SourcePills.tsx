import type { SourceCounts } from '@/src/library/select';
import type { SourceFilter } from '@/src/library/view';
import { SOURCE_FILTERS } from '@/src/library/view';
import { SOURCE_LABELS } from './source-labels';

/** The sources as a row of pills, for the narrow layout (DESIGN, 4.5). */
export function SourcePills(props: {
  counts: SourceCounts;
  selected: SourceFilter;
  onSelect(source: SourceFilter): void;
}) {
  return (
    <div class="pills" role="group" aria-label="Sources">
      {SOURCE_FILTERS.map((source) => (
        <button
          key={source}
          type="button"
          class="pill"
          aria-pressed={source === props.selected}
          onClick={() => props.onSelect(source)}
        >
          {SOURCE_LABELS[source]}{' '}
          <span class="pill__count">{props.counts[source].toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}
