/**
 * Writes an export as CSV (docs/SPEC.md, 12.2): UTF-8 with a byte order
 * mark, RFC 4180 quoting, one header row, one row per post. CSV is for
 * spreadsheets and other tools; it cannot be imported again.
 */

import type { PostTag, StoredPost, Tag } from '@/src/db/types';
import type { ExportData } from './read';

export const CSV_COLUMNS = [
  'post_id',
  'url',
  'author_handle',
  'author_name',
  'posted_at',
  'saved_at',
  'sources',
  'tags',
  'text',
  'media_urls',
] as const;

/** Lets spreadsheet applications tell the file is UTF-8. */
const BYTE_ORDER_MARK = '\uFEFF';
const LINE_END = '\r\n';
/** Separates sources and tags in one cell. Tag names cannot contain it. */
const LIST_SEPARATOR = ';';

/** A spreadsheet would read a cell starting with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * Identifiers, always quoted. A spreadsheet reads a bare run of digits as a
 * number: a post ID's 19 digits lose their last four, and a handle such as
 * `007` its zeros. Quoted, they can be kept as text, with LibreOffice's
 * "Format quoted field as text", or by choosing Text for the column on import.
 */
const ALWAYS_QUOTED: ReadonlySet<(typeof CSV_COLUMNS)[number]> = new Set([
  'post_id',
  'author_handle',
]);

/** One cell: neutralised if it could run as a formula, and quoted if it must be or `quoted` asks. */
export function csvCell(value: string, quoted = false): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return quoted || NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const isoOf = (time: number | null) => (time === null ? '' : new Date(time).toISOString());

export function csvRow(post: StoredPost, tagNames: readonly string[]): string {
  const sources = [post.isBookmark === 1 ? 'bookmark' : '', post.isLike === 1 ? 'like' : ''];
  const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
    post_id: post.id,
    url: post.url,
    author_handle: post.author.handle,
    author_name: post.author.name,
    posted_at: isoOf(post.createdAt),
    saved_at: isoOf(post.savedAt),
    sources: sources.filter(Boolean).join(LIST_SEPARATOR),
    tags: tagNames.join(LIST_SEPARATOR),
    text: post.text,
    media_urls: post.media.map((item) => item.url).join(' '),
  };
  return (
    CSV_COLUMNS.map((column) => csvCell(cells[column], ALWAYS_QUOTED.has(column))).join(',') +
    LINE_END
  );
}

/** The file, in parts: the header, then a row for each exported post, its tags in the order they were applied. */
export function csvParts(data: Pick<ExportData, 'posts' | 'tags' | 'postTags'>): string[] {
  const names = tagNamesByPost(data.tags, data.postTags);
  return [
    BYTE_ORDER_MARK + CSV_COLUMNS.join(',') + LINE_END,
    ...data.posts.map((post) => csvRow(post, names.get(post.id) ?? [])),
  ];
}

function tagNamesByPost(tags: readonly Tag[], links: readonly PostTag[]): Map<string, string[]> {
  const nameOf = new Map(tags.map((tag) => [tag.id, tag.name]));
  const byPost = new Map<string, string[]>();
  for (const link of [...links].sort((a, b) => a.taggedAt - b.taggedAt)) {
    const name = nameOf.get(link.tagId);
    if (name === undefined) continue;
    const names = byPost.get(link.postId);
    if (names) names.push(name);
    else byPost.set(link.postId, [name]);
  }
  return byPost;
}
