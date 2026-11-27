import type { TagSuggestion } from '@/src/db/types';
import type { TagMatch, ViewChange } from '@/src/library/view';
import { TagChip } from './TagChip';

/** The selected tags, each removable, and with more than one, whether all or any must match. */
export function FilterBar(props: {
  selected: readonly TagSuggestion[];
  match: TagMatch;
  onChange(change: ViewChange): void;
}) {
  const { selected, match, onChange } = props;
  if (selected.length === 0) return null;
  return (
    <div class="filters" role="group" aria-label="Filters">
      <span class="filters__label">Filters:</span>
      {selected.map((tag) => (
        <TagChip
          key={tag.id}
          tag={tag}
          removeLabel={`Remove filter ${tag.name}`}
          onRemove={() => onChange({ type: 'untag', tagId: tag.id })}
        />
      ))}
      {selected.length > 1 ? (
        <fieldset class="segmented filters__match" aria-label="Match">
          {(['all', 'any'] as const).map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="match"
                checked={match === option}
                onChange={() => onChange({ type: 'match', match: option })}
              />
              {option === 'all' ? 'All tags' : 'Any tag'}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
