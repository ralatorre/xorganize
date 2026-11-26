/** Names export files: `xorganize-export[-<tag>]-YYYY-MM-DD.<format>` (docs/SPEC.md, 12.1). */

import type { ExportFormat } from './format';

/** How much of a tag name goes into a file name, in characters. */
export const MAX_NAME_IN_FILE = 50;

const pad = (value: number) => String(value).padStart(2, '0');

/** The date is the user's own: the day they made the file. */
export function exportFilename(format: ExportFormat, date: Date, tag?: string): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const name = tag === undefined ? '' : fileSafe(tag);
  return `xorganize-export-${name ? `${name}-` : ''}${day}.${format}`;
}

/**
 * A tag name as it can appear in a file name on any system: letters and
 * digits in any script, with every run of anything else, `/` included, made
 * one `-`. Empty when nothing is left.
 */
export function fileSafe(name: string): string {
  const dashed = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-');
  return Array.from(dashed.replace(/^-+/, ''))
    .slice(0, MAX_NAME_IN_FILE)
    .join('')
    .replace(/-+$/, '');
}
