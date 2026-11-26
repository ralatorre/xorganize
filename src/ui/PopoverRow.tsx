import type { Row } from '@/src/inline/popover-model';
import { TagDot } from './TagDot';

/** One suggestion in the tag popover: an existing tag with its count, or the offer to create one. */
export function PopoverRow({ row }: { row: Row }) {
  if (row.kind === 'create') return <span class="name">+ Create “{row.name}”</span>;
  return (
    <>
      <TagDot colour={row.tag.color} />
      <span class="name">{row.tag.name}</span>
      <span class="uses">{row.tag.count.toLocaleString()}</span>
    </>
  );
}
