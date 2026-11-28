import type { Ref } from 'preact';
import type { TagId, TagSummary } from '@/src/db/types';
import { TagDot } from '@/src/ui/TagDot';
import { Icon } from './Icon';

/**
 * A post's tags, then the button that changes them in the tag popover: "Add
 * tag" while there is none, a small + after. A tag shows its posts; with Ctrl
 * or Cmd held it is added to the filter (DESIGN, 4.5).
 */
export function PostTags(props: {
  tags: readonly TagSummary[];
  onShow(tagId: TagId, add: boolean): void;
  onTag(button: HTMLElement): void;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const none = props.tags.length === 0;
  return (
    <ul class="post__tags" aria-label="Tags">
      {props.tags.map((tag) => (
        <li key={tag.id}>
          <button
            type="button"
            class="chip chip--tag"
            title={`Show posts tagged ${tag.name}. Ctrl-click or ⌘-click to combine.`}
            onClick={(event) => props.onShow(tag.id, event.ctrlKey || event.metaKey)}
          >
            <TagDot colour={tag.color} />
            <span>{tag.name}</span>
          </button>
        </li>
      ))}
      <li key="add">
        <button
          ref={props.buttonRef}
          type="button"
          class={none ? 'chip chip--add chip--add-text' : 'chip chip--add'}
          aria-label={none ? undefined : 'Change tags'}
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-keyshortcuts="t"
          data-action="tag"
          onClick={(event) => props.onTag(event.currentTarget)}
        >
          <Icon name="plus" size="tiny" />
          {none ? 'Add tag' : null}
        </button>
      </li>
    </ul>
  );
}
