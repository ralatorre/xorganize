/**
 * Import as the library page uses it: read a picked file, then write it and
 * tell open x.com tabs that tags changed, as edits do (./edits.ts).
 */

import type { LibraryDatabase } from '@/src/db/schema';
import type { AccountId } from '@/src/db/types';
import {
  importBackup,
  readBackup,
  type ImportMode,
  type ImportOptions,
  type ImportResult,
} from '@/src/transfer/import';
import type { Backup, ImportLimits, ParsedBackup } from '@/src/transfer/validate';

export interface LibraryImport {
  read(file: Pick<Blob, 'size' | 'text'>): Promise<ParsedBackup>;
  /** Resolves to what was written, or undefined if nothing could be. */
  write(backup: Backup, mode: ImportMode): Promise<ImportResult | undefined>;
}

export function createLibraryImport(
  db: LibraryDatabase,
  announce: (accountId: AccountId) => void,
  options: ImportOptions & { limits?: ImportLimits } = {},
): LibraryImport {
  return {
    read: (file) => readBackup(file, options.limits),
    write: (backup, mode) =>
      importBackup(db, backup, mode, options).then(
        (result) => {
          announce(result.accountId);
          return result;
        },
        () => undefined,
      ),
  };
}
