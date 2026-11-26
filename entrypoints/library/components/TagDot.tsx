import { tagColour } from '@/src/tags/palette';

/** A tag's colour. Decoration only: the tag's name is always shown beside it. */
export function TagDot({ colour }: { colour: number }) {
  return <span class="tag-dot" style={{ background: tagColour(colour) }} aria-hidden="true" />;
}
