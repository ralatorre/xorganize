import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RenameResult } from '@/src/db/tags';
import type { TagId, TagSuggestion } from '@/src/db/types';
import { ColourPicker } from './ColourPicker';
import { MergeTagForm } from './MergeTagForm';
import { RenameTagForm } from './RenameTagForm';

/** What can be done to a tag from the sidebar. */
export interface TagManagement {
  rename(tagId: TagId, name: string): Promise<RenameResult>;
  recolour(tagId: TagId, colour: number): void;
  merge(fromId: TagId, intoId: TagId): void;
  /** Asks first; see ConfirmDialog. */
  remove(tag: TagSuggestion): void;
}

type Mode = 'menu' | 'rename' | 'colour' | 'merge';

const QUIET = 'button button--small button--quiet';

/**
 * The panel under a tag in the sidebar (DESIGN, 4.5): Rename, Change colour,
 * Merge into another tag, and Delete. Esc closes it.
 */
export function TagManager(props: {
  tag: TagSuggestion;
  /** Every tag, for Merge. */
  tags: readonly TagSuggestion[];
  manage: TagManagement;
  onClose(): void;
}) {
  const { tag, manage, onClose } = props;
  const [mode, setMode] = useState<Mode>('menu');
  const first = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (mode === 'menu') first.current?.focus();
  }, [mode]);

  return (
    <div
      class="manage"
      role="group"
      aria-label={`Manage ${tag.name}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onClose();
      }}
    >
      {mode === 'menu' ? (
        <div class="manage__actions">
          <button ref={first} type="button" class={QUIET} onClick={() => setMode('rename')}>
            Rename
          </button>
          <button type="button" class={QUIET} onClick={() => setMode('colour')}>
            Change colour
          </button>
          <button type="button" class={QUIET} onClick={() => setMode('merge')}>
            Merge into…
          </button>
          <button
            type="button"
            class={`${QUIET} manage__danger`}
            onClick={() => manage.remove(tag)}
          >
            Delete…
          </button>
        </div>
      ) : mode === 'rename' ? (
        <RenameTagForm
          name={tag.name}
          onRename={(name) => manage.rename(tag.id, name)}
          onDone={onClose}
        />
      ) : mode === 'colour' ? (
        <ColourPicker
          colour={tag.color}
          onChange={(colour) => manage.recolour(tag.id, colour)}
          onDone={onClose}
        />
      ) : (
        <MergeTagForm
          tag={tag}
          others={props.tags.filter((other) => other.id !== tag.id)}
          onMerge={(intoId) => {
            manage.merge(tag.id, intoId);
            onClose();
          }}
          onCancel={onClose}
        />
      )}
    </div>
  );
}
