import { useLayoutEffect, useRef } from 'preact/hooks';
import type { TagId, TagSuggestion } from '@/src/db/types';
import { plural } from '@/src/library/format';
import { Select } from './Select';

/** Which tag to merge this one into. The posts move; this tag goes. */
export function MergeTagForm(props: {
  tag: TagSuggestion;
  others: readonly TagSuggestion[];
  onMerge(intoId: TagId): void;
  onCancel(): void;
}) {
  const { tag, others } = props;
  const select = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => select.current?.focus(), []);
  if (others.length === 0) {
    return (
      <div class="manage__form">
        <p class="manage__note">There is no other tag to merge into.</p>
        <div class="manage__buttons">
          <button type="button" class="button button--small" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <form
      class="manage__form"
      onSubmit={(event) => {
        event.preventDefault();
        const intoId = select.current?.value;
        if (intoId) props.onMerge(intoId);
      }}
    >
      <label class="manage__label">
        Merge into
        <Select selectRef={select} class="select--block">
          {others.map((other) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
        </Select>
      </label>
      <p class="manage__note">
        Its {plural(tag.count, 'post')} move to that tag, and “{tag.name}” is removed.
      </p>
      <div class="manage__buttons">
        <button type="submit" class="button button--small button--primary">
          Merge
        </button>
        <button type="button" class="button button--small" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
