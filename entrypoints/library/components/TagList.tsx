import { useState } from 'preact/hooks';
import type { TagId, TagSuggestion } from '@/src/db/types';
import type { TagNode } from '@/src/library/tag-tree';
import type { View, ViewChange } from '@/src/library/view';
import { Icon } from './Icon';
import { TagTreeItem } from './TagTreeItem';

/** What can be done to tags from the sidebar. All but a new colour ask first. */
export interface TagActions {
  create(): void;
  rename(tag: TagSuggestion): void;
  recolour(tag: TagSuggestion, colour: number): void;
  merge(tag: TagSuggestion): void;
  remove(tag: TagSuggestion): void;
}

/**
 * Every tag with its count, grouped by `/` in names, with "+" for a new tag.
 * One tag's menu is open at a time.
 */
export function TagList(props: {
  tags: readonly TagSuggestion[];
  tree: readonly TagNode[];
  groupCounts: ReadonlyMap<string, number>;
  view: View;
  onChange(change: ViewChange): void;
  actions: TagActions;
}) {
  const [menuFor, setMenuFor] = useState<TagId>();
  return (
    <section class="sidebar__section" aria-labelledby="tags-title">
      <div class="sidebar__heading">
        <h2 id="tags-title">Tags</h2>
        <button
          type="button"
          class="icon-button icon-button--small"
          aria-label="New tag"
          title="New tag"
          onClick={props.actions.create}
        >
          <Icon name="plus" size="small" />
        </button>
      </div>
      {props.tags.length === 0 ? (
        <p class="sidebar__none">Tag posts on X with the tag button beside the bookmark.</p>
      ) : (
        <>
          <ul>
            {props.tree.map((node) => (
              <TagTreeItem
                key={node.key}
                node={node}
                view={props.view}
                onChange={props.onChange}
                groupCounts={props.groupCounts}
                menuFor={menuFor}
                onMenu={setMenuFor}
                canMerge={props.tags.length > 1}
                actions={props.actions}
              />
            ))}
          </ul>
          <p class="sidebar__hint">Ctrl-click or Cmd-click a tag to combine it with others.</p>
        </>
      )}
    </section>
  );
}
