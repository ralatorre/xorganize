/**
 * Writes an export as JSON, in parts: one per record, so that a large library
 * is never held as one string. Joined, the parts are one JSON document, with
 * a record on each line.
 */

import { exportedPost, exportedPostTag, exportedTag, type ExportHeader } from './format';
import type { ExportData } from './read';

export function jsonParts(header: ExportHeader, data: ExportData): string[] {
  const head = JSON.stringify(header);
  return [
    head.slice(0, -1), // the header's fields, with the object left open
    ...list('tags', data.tags.map(exportedTag)),
    ...list('posts', [...data.posts, ...data.quoted].map(exportedPost)),
    ...list('postTags', data.postTags.map(exportedPostTag)),
    '\n}\n',
  ];
}

function list(name: string, items: readonly unknown[]): string[] {
  return [
    `,\n${JSON.stringify(name)}:[`,
    ...items.map((item, index) => `${index === 0 ? '\n' : ',\n'}${JSON.stringify(item)}`),
    items.length === 0 ? ']' : '\n]',
  ];
}
