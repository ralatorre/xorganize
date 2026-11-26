import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { TagId, TagSuggestion } from '@/src/db/types';
import type { TagNode } from '@/src/library/tag-tree';
import { TagDot } from '@/src/ui/TagDot';

/**
 * One tag or group in the sidebar, and what is inside it. Groups start open.
 * A tag's ⋯ button, or a right click on the tag, opens `manager` below it.
 */
export function TagTreeItem(props: {
  node: TagNode;
  selected: readonly TagId[];
  onSelect(tagId: TagId, add: boolean): void;
  /** The tag whose panel is open, if any. */
  managing: TagId | undefined;
  onManage(tagId: TagId | undefined): void;
  manager(tag: TagSuggestion, close: () => void): ComponentChildren;
}) {
  const { node, selected, onSelect, managing, onManage } = props;
  const [open, setOpen] = useState(true);
  const toggle = useRef<HTMLButtonElement>(null);
  const { tag } = node;
  const grouped = node.children.length > 0;
  const managed = tag !== undefined && managing === tag.id;
  const close = () => {
    onManage(undefined);
    toggle.current?.focus();
  };

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
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          </button>
        ) : (
          <span class="tag-row__toggle" aria-hidden="true" />
        )}
        {tag ? (
          <>
            <button
              type="button"
              class="sidebar__item"
              aria-pressed={selected.includes(tag.id)}
              title="Ctrl-click or Cmd-click to add to the filter"
              onClick={(event) => onSelect(tag.id, event.ctrlKey || event.metaKey)}
              onContextMenu={(event) => {
                event.preventDefault();
                onManage(tag.id);
              }}
            >
              <TagDot colour={tag.color} />
              <span class="sidebar__label">{node.label}</span>{' '}
              <span class="sidebar__count">{tag.count.toLocaleString()}</span>
            </button>
            <button
              ref={toggle}
              type="button"
              class="tag-row__manage"
              aria-label={`Manage ${tag.name}`}
              aria-expanded={managed}
              onClick={() => onManage(managed ? undefined : tag.id)}
            >
              ⋯
            </button>
          </>
        ) : (
          <span class="sidebar__group">{node.label}</span>
        )}
      </div>
      {managed ? props.manager(tag, close) : null}
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
