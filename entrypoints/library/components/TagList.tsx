import type { TagId, TagSuggestion } from '@/src/db/types';
import { tagTree } from '@/src/library/tag-tree';
import { TagTreeItem } from './TagTreeItem';

/** Every tag with its count, grouped by `/` in names. */
export function TagList(props: {
  tags: readonly TagSuggestion[];
  selected: readonly TagId[];
  onSelect(tagId: TagId, add: boolean): void;
}) {
  return (
    <section class="sidebar__section" aria-labelledby="tags-title">
      <h2 id="tags-title">Tags</h2>
      {props.tags.length === 0 ? (
        <p class="sidebar__none">Tag posts on X with the tag button beside the bookmark.</p>
      ) : (
        <ul>
          {tagTree(props.tags).map((node) => (
            <TagTreeItem
              key={node.key}
              node={node}
              selected={props.selected}
              onSelect={props.onSelect}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
