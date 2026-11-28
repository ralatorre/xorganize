/** What "Export view" exports: exactly the posts the view lists (docs/SPEC.md, 12). */

import type { ExportFormat } from '@/src/transfer/format';
import type { ExportScope } from '@/src/transfer/read';
import type { Exported } from './exporter';
import type { Browse } from './browse';
import { plural } from './format';

/** The view's posts, in its order. A view of one tag names the file after it. */
export function viewScope(view: Pick<Browse, 'ids' | 'selected'>): ExportScope {
  const [only, ...others] = view.selected;
  return only && others.length === 0
    ? { postIds: view.ids, tag: only.name }
    : { postIds: view.ids };
}

export const EXPORT_FAILED = 'Could not export. Try again.';

const FORMAT_NAMES: Record<ExportFormat, string> = { json: 'JSON', csv: 'CSV' };

/** The toast once an export is done: how many posts went out, and as what. */
export function exportMessage(exported: Exported | undefined, format: ExportFormat): string {
  if (!exported) return EXPORT_FAILED;
  return `Exported ${plural(exported.count, 'post')} as ${FORMAT_NAMES[format]}`;
}

/** The toast once a backup is saved: the file's name, to find it again. */
export function backupMessage(exported: Exported | undefined): string {
  return exported ? `Backup saved: ${exported.name}` : EXPORT_FAILED;
}

/** What the Export menu says it exports. */
export function exportMenuLabel(count: number): string {
  return count === 1
    ? 'Export the post in this view'
    : `Export the ${plural(count, 'post')} in this view`;
}
