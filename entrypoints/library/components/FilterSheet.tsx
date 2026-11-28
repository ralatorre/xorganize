import { useLayoutEffect, useRef } from 'preact/hooks';
import type { TagSuggestion } from '@/src/db/types';
import { plural } from '@/src/library/format';
import type { TagMatch, ViewChange } from '@/src/library/view';
import { TagDot } from '@/src/ui/TagDot';
import { Icon } from './Icon';
import { MatchSwitch } from './MatchSwitch';

/**
 * The narrow layout's tags, in a sheet from the bottom (DESIGN, 4.5). Each
 * tag is ticked while chosen; the list behind follows at once, and the
 * button says how many posts it shows.
 */
export function FilterSheet(props: {
  tags: readonly TagSuggestion[];
  selected: readonly TagSuggestion[];
  match: TagMatch;
  /** How many posts the list shows with these filters. */
  count: number;
  onChange(change: ViewChange): void;
  onClose(): void;
}) {
  const { selected, onChange, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const chosen = new Set(selected.map(({ id }) => id));

  return (
    <dialog
      ref={dialog}
      class="sheet"
      aria-labelledby="sheet-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div class="sheet__grabber" aria-hidden="true" />
      <div class="sheet__head">
        <h2 id="sheet-title" class="sheet__title">
          Filters
        </h2>
        {selected.length > 0 ? (
          <button
            type="button"
            class="link-button"
            onClick={() => {
              for (const tag of selected) onChange({ type: 'untag', tagId: tag.id });
            }}
          >
            Clear tags
          </button>
        ) : null}
      </div>
      <h3 class="sheet__label">Tags</h3>
      {props.tags.length === 0 ? (
        <p class="sidebar__none">Tag posts on X with the tag button beside the bookmark.</p>
      ) : (
        <ul class="sheet__tags">
          {props.tags.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                class="sidebar__item sheet__tag"
                aria-pressed={chosen.has(tag.id)}
                onClick={() => onChange({ type: 'tag', tagId: tag.id, add: true })}
              >
                <TagDot colour={tag.color} />
                <span class="sidebar__label">{tag.name}</span>
                {chosen.has(tag.id) ? <Icon name="tick" size="small" /> : null}
                <span class="sidebar__count">{tag.count.toLocaleString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected.length > 1 ? (
        <div class="sheet__match">
          <span>Posts must have</span>
          <MatchSwitch match={props.match} name="sheet-match" onChange={onChange} />
        </div>
      ) : null}
      <button
        type="button"
        class="button button--primary button--large sheet__show"
        onClick={onClose}
      >
        Show {plural(props.count, 'post')}
      </button>
    </dialog>
  );
}
