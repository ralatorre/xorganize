/** What "Export view" exports: exactly the posts the view lists (docs/SPEC.md, 12). */

import type { ExportScope } from '@/src/transfer/read';
import type { Browse } from './browse';
import { plural } from './format';

/** The view's posts, in its order. A view of one tag names the file after it. */
export function viewScope(view: Pick<Browse, 'ids' | 'selected'>): ExportScope {
  const [only, ...others] = view.selected;
  return only && others.length === 0
    ? { postIds: view.ids, tag: only.name }
    : { postIds: view.ids };
}

/** What an export control says once it is done: how many posts went out, or that none could. */
export function exportStatus(count: number | undefined): string {
  return count === undefined ? 'Could not export. Try again.' : `Exported ${plural(count, 'post')}`;
}
