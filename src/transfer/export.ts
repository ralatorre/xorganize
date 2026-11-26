/**
 * Export (docs/SPEC.md, 12): the one entry point, used by every control that
 * exports. It returns the file's name, type and contents; saving it is the
 * page's job.
 */

import type { LibraryDatabase } from '@/src/db/schema';
import type { AccountId } from '@/src/db/types';
import { csvParts } from './csv';
import { exportFilename } from './filename';
import { FORMAT_NAME, FORMAT_VERSION, type ExportFormat, type ExportHeader } from './format';
import { jsonParts } from './json';
import { readExport, type ExportScope } from './read';

const TYPES: Record<ExportFormat, string> = {
  json: 'application/json',
  csv: 'text/csv;charset=utf-8',
};

export interface ExportedFile {
  name: string;
  /** Its media type. */
  type: string;
  /** Its contents, to be joined: a large library is never one string. */
  parts: string[];
  /** How many posts it holds, not counting the quoted posts a JSON file carries with them. */
  count: number;
}

export async function exportPosts(
  db: LibraryDatabase,
  accountId: AccountId,
  scope: ExportScope,
  format: ExportFormat,
  now: Date,
): Promise<ExportedFile> {
  const data = await readExport(db, accountId, scope);
  const partial = scope !== 'library';
  const name = exportFilename(format, now, partial ? scope.tag : undefined);
  const count = data.posts.length;
  if (format === 'csv') return { name, type: TYPES.csv, parts: csvParts(data), count };

  const header: ExportHeader = {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    accountId,
    ...(partial ? { scope: 'partial' as const } : {}),
  };
  return { name, type: TYPES.json, parts: jsonParts(header, data), count };
}
