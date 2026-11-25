import type { TagSummary } from '@/src/db/types';
import { TagDot } from './TagDot';

/** A tag's name and colour. With `onRemove`, a button to take it away. */
export function TagChip(props: { tag: TagSummary; removeLabel?: string; onRemove?(): void }) {
  const { tag, onRemove } = props;
  return (
    <span class="chip">
      <TagDot colour={tag.color} />
      <span>{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          class="chip__remove"
          aria-label={props.removeLabel ?? `Remove ${tag.name}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
