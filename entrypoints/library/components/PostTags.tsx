import type { TagSummary } from '@/src/db/types';
import { TagChip } from './TagChip';

/** A post's tags, and [+] to change them in the tag popover. */
export function PostTags(props: { tags: readonly TagSummary[]; onTag(button: HTMLElement): void }) {
  return (
    <ul class="post__tags" aria-label="Tags">
      {props.tags.map((tag) => (
        <li key={tag.id}>
          <TagChip tag={tag} />
        </li>
      ))}
      <li key="add">
        <button
          type="button"
          class="chip chip--add"
          aria-label={props.tags.length === 0 ? 'Add tags' : 'Change tags'}
          aria-haspopup="dialog"
          aria-expanded="false"
          data-action="tag"
          onClick={(event) => props.onTag(event.currentTarget)}
        >
          +
        </button>
      </li>
    </ul>
  );
}
