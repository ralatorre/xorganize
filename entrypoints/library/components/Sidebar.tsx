import type { TagSuggestion } from '@/src/db/types';
import type { SourceCounts } from '@/src/library/select';
import type { TagNode } from '@/src/library/tag-tree';
import type { View, ViewChange } from '@/src/library/view';
import { SourceList } from './SourceList';
import { TagList, type TagActions } from './TagList';

/** Sources and tags, which choose what the list shows (DESIGN, 4.5). */
export function Sidebar(props: {
  counts: SourceCounts;
  tags: readonly TagSuggestion[];
  /** The tags as the sidebar lists them, with the posts in each group. */
  tree: readonly TagNode[];
  groupCounts: ReadonlyMap<string, number>;
  view: View;
  onChange(change: ViewChange): void;
  actions: TagActions;
}) {
  const { onChange } = props;
  return (
    <nav class="sidebar" aria-label="Library">
      <SourceList
        counts={props.counts}
        selected={props.view.source}
        onSelect={(source) => onChange({ type: 'source', source })}
      />
      <TagList
        tags={props.tags}
        tree={props.tree}
        groupCounts={props.groupCounts}
        view={props.view}
        onChange={onChange}
        actions={props.actions}
      />
    </nav>
  );
}
