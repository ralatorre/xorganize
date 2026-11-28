import { useState } from 'preact/hooks';
import type { TagId } from '@/src/db/types';
import { tagsIn, type TagNode } from '@/src/library/tag-tree';
import { groupChosen, type View, type ViewChange } from '@/src/library/view';
import { TagDot } from '@/src/ui/TagDot';
import { Icon } from './Icon';
import type { TagActions } from './TagList';
import { TagMenu } from './TagMenu';

/**
 * One tag or group in the sidebar, and what is inside it (DESIGN, 4.5).
 * Groups start open; the arrow folds them. A tag's ⋯ button, or a right
 * click on it, opens its menu. A group without a tag of its own shows every
 * tag in it.
 */
export function TagTreeItem(props: {
  node: TagNode;
  view: View;
  onChange(change: ViewChange): void;
  /** Posts in each group without a tag of its own, by node key. */
  groupCounts: ReadonlyMap<string, number>;
  /** The tag whose menu is open, if any. */
  menuFor: TagId | undefined;
  onMenu(tagId: TagId | undefined): void;
  canMerge: boolean;
  actions: TagActions;
}) {
  const { node, view, onChange, menuFor, onMenu, actions } = props;
  const [open, setOpen] = useState(true);
  const { tag } = node;
  const grouped = node.children.length > 0;

  return (
    <li>
      <div class="tag-row">
        {grouped ? (
          <button
            type="button"
            class="tag-row__toggle"
            aria-expanded={open}
            aria-label={`${node.label} group`}
            onClick={() => setOpen(!open)}
          >
            <Icon name="chevron" size="tiny" />
          </button>
        ) : null}
        {tag ? (
          <>
            <button
              type="button"
              class={tag.count === 0 ? 'sidebar__item sidebar__item--unused' : 'sidebar__item'}
              aria-pressed={view.tags.includes(tag.id)}
              title="Ctrl-click or Cmd-click to combine with other tags"
              onClick={(event) =>
                onChange({ type: 'tag', tagId: tag.id, add: event.ctrlKey || event.metaKey })
              }
              onContextMenu={(event) => {
                event.preventDefault();
                onMenu(tag.id);
              }}
            >
              <TagDot colour={tag.color} />
              <span class="sidebar__label">{node.label}</span>{' '}
              <span class="sidebar__count">{tag.count.toLocaleString()}</span>
            </button>
            <TagMenu
              tag={tag}
              canMerge={props.canMerge}
              open={menuFor === tag.id}
              onOpenChange={(opened) => onMenu(opened ? tag.id : undefined)}
              onRename={() => actions.rename(tag)}
              onRecolour={(colour) => actions.recolour(tag, colour)}
              onMerge={() => actions.merge(tag)}
              onDelete={() => actions.remove(tag)}
            />
          </>
        ) : (
          <button
            type="button"
            class="sidebar__item sidebar__item--group"
            aria-pressed={groupChosen(view, tagsIn(node))}
            title="Show every tag in this group"
            onClick={() => onChange({ type: 'group', tagIds: tagsIn(node) })}
          >
            <span class="sidebar__label">{node.label}</span>{' '}
            <span class="sidebar__count">
              {(props.groupCounts.get(node.key) ?? 0).toLocaleString()}
            </span>
          </button>
        )}
      </div>
      {grouped && open ? (
        <ul>
          {node.children.map((child) => (
            <TagTreeItem key={child.key} {...props} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
