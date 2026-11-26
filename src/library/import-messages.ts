/** What the library says about an import (docs/DESIGN.md, 5.6). */

import type { AccountId } from '@/src/db/types';
import type { BackupSummary, ImportResult } from '@/src/transfer/import';
import type { BackupProblem, ProblemAt } from '@/src/transfer/validate';
import { formatDate, plural } from './format';

const RECORDS: Record<ProblemAt['section'], string> = {
  tags: 'tag',
  posts: 'post',
  postTags: 'tag assignment',
};

/** Why a file cannot be imported, in words that say what to do about it. */
export function problemMessage(problem: BackupProblem): string {
  switch (problem.kind) {
    case 'too-large':
      return 'This file is too large to import.';
    case 'unreadable':
      return 'The file could not be read. Try again.';
    case 'not-json':
      return 'This is not a JSON backup. Only JSON backups from xorganize can be imported; CSV files cannot.';
    case 'not-export':
      return 'This file is not an xorganize backup.';
    case 'newer-version':
      return 'This backup was made by a newer version of xorganize. Update the extension, then import it.';
    case 'too-many':
      return `This file holds more ${RECORDS[problem.section]}s than can be imported.`;
    case 'invalid':
      return `The file is damaged: ${RECORDS[problem.section]} ${problem.position.toLocaleString()} is not valid. Nothing was imported.`;
    case 'duplicate':
      return `The file is damaged: ${RECORDS[problem.section]} ${problem.position.toLocaleString()} appears twice. Nothing was imported.`;
    case 'dangling':
      return `The file is damaged: tag assignment ${problem.position.toLocaleString()} refers to a post or tag it does not hold. Nothing was imported.`;
  }
}

/** What the preview says the file holds, and anything to know before importing it. */
export function previewLines(summary: BackupSummary, shown: AccountId | undefined): string[] {
  const lines = [
    `${plural(summary.posts, 'post')}, ${plural(summary.tags, 'tag')} and ${plural(summary.postTags, 'tag assignment')}, exported ${formatDate(Date.parse(summary.exportedAt))}.`,
  ];
  if (summary.partial) {
    lines.push('It holds part of a library, so it can only be merged into this one.');
  }
  if (shown !== undefined && shown !== summary.accountId) {
    lines.push(
      'It is from a different X account than the library shows. Importing it opens that account’s library.',
    );
  }
  return lines;
}

/** What Replace takes away first, so that the choice is made knowingly. */
export const REPLACE_WARNING =
  'Replace deletes this account’s posts and tags first, including any the file does not hold. Merge keeps them and adds the file’s.';

/** What the import control says once it is done. */
export function importStatus(result: ImportResult | undefined): string {
  return result === undefined
    ? 'Could not import. Nothing was changed.'
    : `Imported ${plural(result.posts, 'post')} and ${plural(result.tags, 'tag')}`;
}
