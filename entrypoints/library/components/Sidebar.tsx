import type { TagSuggestion } from '@/src/db/types';
import type { SourceCounts } from '@/src/library/select';
import type { View, ViewChange } from '@/src/library/view';
import { SourceList } from './SourceList';
import { TagList } from './TagList';
import type { TagManagement } from './TagManager';

/** Sources and tags, which choose what the list shows (DESIGN, 4.5). */
export function Sidebar(props: {
  counts: SourceCounts;
  tags: readonly TagSuggestion[];
  view: View;
  onChange(change: ViewChange): void;
  manage: TagManagement;
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
        selected={props.view.tags}
        onSelect={(tagId, add) => onChange({ type: 'tag', tagId, add })}
        manage={props.manage}
      />
    </nav>
  );
}
