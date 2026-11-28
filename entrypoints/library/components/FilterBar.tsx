import type { TagSuggestion } from '@/src/db/types';
import type { TagMatch, ViewChange } from '@/src/library/view';
import { Icon } from './Icon';
import { MatchSwitch } from './MatchSwitch';
import { TagChip } from './TagChip';

/**
 * Shown while anything narrows the view (DESIGN, 4.5): the search as a chip,
 * each chosen tag, All tags / Any tag once two are chosen, and Clear all,
 * which keeps the order.
 */
export function FilterBar(props: {
  query: string;
  selected: readonly TagSuggestion[];
  match: TagMatch;
  onChange(change: ViewChange): void;
}) {
  const { selected, match, onChange } = props;
  const searched = props.query.trim();
  if (selected.length === 0 && searched === '') return null;
  return (
    <div class="filters" role="group" aria-label="Filters">
      {searched === '' ? null : (
        <span class="chip">
          <Icon name="search" size="tiny" />
          <span>“{searched}”</span>
          <button
            type="button"
            class="chip__remove"
            aria-label="Clear search"
            onClick={() => onChange({ type: 'query', query: '' })}
          >
            <Icon name="close" size="tiny" />
          </button>
        </span>
      )}
      {selected.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          removeLabel={`Remove filter ${tag.name}`}
          onRemove={() => onChange({ type: 'untag', tagId: tag.id })}
        />
      ))}
      {selected.length > 1 ? <MatchSwitch match={match} name="match" onChange={onChange} /> : null}
      <button type="button" class="link-button" onClick={() => onChange({ type: 'clear' })}>
        Clear all
      </button>
    </div>
  );
}
