import type { ComponentChildren } from 'preact';
import type { TagSuggestion } from '@/src/db/types';
import type { SourceCounts } from '@/src/library/select';
import type { View, ViewChange } from '@/src/library/view';
import { SourceList } from './SourceList';
import { TagList } from './TagList';

/** Sources and tags, which choose what the list shows. `children` go at the bottom. */
export function Sidebar(props: {
  counts: SourceCounts;
  tags: readonly TagSuggestion[];
  view: View;
  onChange(change: ViewChange): void;
  children?: ComponentChildren;
}) {
  const { onChange } = props;
  return (
    <nav class="sidebar" aria-label="Library">
      <h1 class="sidebar__title">xorganize</h1>
      <SourceList
        counts={props.counts}
        selected={props.view.source}
        onSelect={(source) => onChange({ type: 'source', source })}
      />
      <TagList
        tags={props.tags}
        selected={props.view.tags}
        onSelect={(tagId, add) => onChange({ type: 'tag', tagId, add })}
      />
      {props.children}
    </nav>
  );
}
