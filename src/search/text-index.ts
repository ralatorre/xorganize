/**
 * The searchable text and author of every post, held in memory. A post
 * matches when its text contains every term and, if any are given, its
 * author is one of them. Matching parts of words, not whole words, finds URLs
 * and handles by any part, and works in languages written without spaces. At
 * 50,000 posts a search takes a few milliseconds (SPEC, 11).
 */

import type { PostId, StoredPost } from '@/src/db/types';
import { matchesToken, type QueryToken } from './query';
import { handleKey, searchTextOf } from './text';

interface Entry {
  text: string;
  handle: string;
}

export class TextIndex {
  private readonly entries = new Map<PostId, Entry>();

  get size(): number {
    return this.entries.size;
  }

  /** Adds a post, or replaces what was held for it. True if that changed anything. */
  put(post: Pick<StoredPost, 'id' | 'text' | 'author'>): boolean {
    const entry = { text: searchTextOf(post), handle: handleKey(post.author.handle) };
    const held = this.entries.get(post.id);
    if (held?.text === entry.text && held.handle === entry.handle) return false;
    this.entries.set(post.id, entry);
    return true;
  }

  /** Drops every post not among `ids`. True if any was dropped. */
  keepOnly(ids: Iterable<PostId>): boolean {
    const kept = new Set(ids);
    let dropped = false;
    for (const id of this.entries.keys()) {
      if (!kept.has(id)) {
        this.entries.delete(id);
        dropped = true;
      }
    }
    return dropped;
  }

  /**
   * The posts whose text contains every term (in searchKey form) and, when
   * authors are given, that are by one of them.
   */
  match(terms: readonly string[], authors: readonly QueryToken[] = []): PostId[] {
    const found: PostId[] = [];
    for (const [id, { text, handle }] of this.entries) {
      if (authors.length > 0 && !authors.some((author) => matchesToken(author, handle))) continue;
      if (terms.every((term) => text.includes(term))) found.push(id);
    }
    return found;
  }
}
