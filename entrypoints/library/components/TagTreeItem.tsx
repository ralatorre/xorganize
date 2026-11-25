import { useState } from 'preact/hooks';
import type { TagId } from '@/src/db/types';
import type { TagNode } from '@/src/library/tag-tree';
import { TagDot } from './TagDot';

/** One tag or group in the sidebar, and what is inside it. Groups start open. */
export function TagTreeItem(props: {
  node: TagNode;
  selected: readonly TagId[];
  onSelect(tagId: TagId, add: boolean): void;
}) {
  const { node, selected, onSelect } = props;
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
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          </button>
        ) : (
          <span class="tag-row__toggle" aria-hidden="true" />
        )}
        {tag ? (
          <button
            type="button"
            class="sidebar__item"
            aria-pressed={selected.includes(tag.id)}
            title="Ctrl-click or Cmd-click to add to the filter"
            onClick={(event) => onSelect(tag.id, event.ctrlKey || event.metaKey)}
          >
            <TagDot colour={tag.color} />
            <span class="sidebar__label">{node.label}</span>{' '}
            <span class="sidebar__count">{tag.count.toLocaleString()}</span>
          </button>
        ) : (
          <span class="sidebar__group">{node.label}</span>
        )}
      </div>
      {grouped && open ? (
        <ul>
          {node.children.map((child) => (
            <TagTreeItem key={child.key} node={child} selected={selected} onSelect={onSelect} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
