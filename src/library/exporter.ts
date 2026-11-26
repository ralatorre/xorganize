/**
 * Export as the library page uses it: build the file, hand it to the page to
 * save, and record a whole-library JSON export as the latest backup.
 */

import { recordBackup } from '@/src/db/repo';
import type { LibraryDatabase } from '@/src/db/schema';
import type { AccountId } from '@/src/db/types';
import { exportPosts, type ExportedFile } from '@/src/transfer/export';
import type { ExportFormat } from '@/src/transfer/format';
import type { ExportScope } from '@/src/transfer/read';

/** Exports, and resolves to how many posts, or undefined if it failed. */
export type LibraryExport = (
  accountId: AccountId,
  scope: ExportScope,
  format: ExportFormat,
) => Promise<number | undefined>;

/** Only this can restore the library, so only this counts as a backup. */
export const isBackup = (scope: ExportScope, format: ExportFormat) =>
  scope === 'library' && format === 'json';

export function createLibraryExport(
  db: LibraryDatabase,
  save: (file: ExportedFile) => void,
  now: () => Date,
): LibraryExport {
  return async (accountId, scope, format) => {
    try {
      const time = now();
      const file = await exportPosts(db, accountId, scope, format, time);
      save(file);
      if (isBackup(scope, format)) await recordBackup(db, accountId, time.getTime());
      return file.count;
    } catch {
      return undefined;
    }
  };
}
