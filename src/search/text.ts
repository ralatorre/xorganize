/**
 * The form posts and queries are compared in, so that case and accents do not
 * decide whether a post is found.
 */

import type { StoredPost } from '@/src/db/types';

/** Combining marks, left over once accented letters are taken apart. */
const MARKS = /\p{M}/gu;

/**
 * Lower-cased, then decomposed with compatibility forms folded together, and
 * without combining marks: "Café" and "cafe" are the same, as are "ｆｕｌｌ"
 * and "full".
 */
export function searchKey(text: string): string {
  return text.toLocaleLowerCase('en-US').normalize('NFKD').replace(MARKS, '');
}

/** Everything a post is found by: its text, and its author's handle and name. */
export function searchTextOf(post: Pick<StoredPost, 'text' | 'author'>): string {
  return searchKey([post.text, post.author.handle, post.author.name].join('\n'));
}

/** The form handles are compared in: lower-cased, as X treats them. */
export function handleKey(handle: string): string {
  return handle.toLocaleLowerCase('en-US');
}
