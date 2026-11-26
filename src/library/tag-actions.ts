/**
 * What the library says about tag management before and after it happens
 * (DESIGN, 4.5): how many posts a deletion touches, and why a rename was
 * refused. Worked out from the catalogue, without reading the database.
 */

import type { RenameProblem } from '@/src/db/tags';
import type { PostId, TagId } from '@/src/db/types';
import { MAX_TAG_NAME } from '@/src/tags/names';
import type { Catalogue } from './browse';
import { plural } from './format';

export interface DeletionImpact {
  /** Posts carrying the tag. */
  posts: number;
  /** Of those, posts with no other tag that are neither bookmarked nor liked. */
  leaving: number;
}

export function deletionImpact(
  catalogue: Pick<Catalogue, 'sets' | 'tagged'>,
  tagId: TagId,
): DeletionImpact {
  const carrying = catalogue.tagged.get(tagId) ?? new Set<PostId>();
  const { bookmarks, likes } = catalogue.sets;
  const kept = new Set<PostId>();
  for (const [otherId, posts] of catalogue.tagged) {
    if (otherId === tagId) continue;
    for (const id of posts) if (carrying.has(id)) kept.add(id);
  }
  let leaving = 0;
  for (const id of carrying) {
    if (!kept.has(id) && !bookmarks.has(id) && !likes.has(id)) leaving += 1;
  }
  return { posts: carrying.size, leaving };
}

/** The confirmation shown before a tag is deleted. */
export function deletionMessage(impact: DeletionImpact): string {
  if (impact.posts === 0) return 'No post carries it.';
  const off = `It will be taken off ${plural(impact.posts, 'post')}.`;
  if (impact.leaving === 0) return `${off} No post leaves the library.`;
  const only =
    impact.leaving === 1
      ? 'One of them is in the library only because of this tag, and will leave it.'
      : `${impact.leaving.toLocaleString()} of them are in the library only because of this tag, and will leave it.`;
  return `${off} ${only}`;
}

const RENAME_PROBLEMS: Record<RenameProblem, string> = {
  empty: 'Type a name.',
  'too-long': `Use at most ${MAX_TAG_NAME} characters.`,
  semicolon: 'A tag name cannot contain a semicolon.',
  control: 'A tag name cannot contain invisible characters.',
  taken: 'Another tag has that name. Merge into it instead.',
  missing: 'This tag no longer exists.',
};

export function renameProblem(problem: RenameProblem): string {
  return RENAME_PROBLEMS[problem];
}
