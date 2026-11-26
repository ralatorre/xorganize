/**
 * The JSON export format (docs/SPEC.md, 12.1). Its version is independent of
 * the database's: importers accept every earlier version of the format.
 */

import type { AccountId, PostTag, StoredPost, Tag } from '@/src/db/types';

/** What a file can be exported as. Only JSON can be imported again. */
export type ExportFormat = 'json' | 'csv';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['json', 'csv'];

export const FORMAT_NAME = 'xorganize';
export const FORMAT_VERSION = 1;

/** A post as exported: what is stored, less the account, which the file states once, and `hasTags`, which import works out again. */
export type ExportedPost = Omit<StoredPost, 'accountId' | 'hasTags'>;
export type ExportedTag = Pick<Tag, 'id' | 'name' | 'color' | 'createdAt' | 'lastUsedAt'>;
export type ExportedPostTag = Pick<PostTag, 'postId' | 'tagId' | 'taggedAt'>;

export interface ExportHeader {
  format: typeof FORMAT_NAME;
  version: typeof FORMAT_VERSION;
  /** ISO 8601, UTC. */
  exportedAt: string;
  accountId: AccountId;
  /** Present when the file holds some of the library, which cannot replace it on import. */
  scope?: 'partial';
}

export function exportedPost(post: StoredPost): ExportedPost {
  const copy: Partial<StoredPost> = { ...post };
  delete copy.accountId;
  delete copy.hasTags;
  return copy as ExportedPost;
}

export function exportedTag(tag: Tag): ExportedTag {
  const { id, name, color, createdAt, lastUsedAt } = tag;
  return { id, name, color, createdAt, lastUsedAt };
}

export function exportedPostTag(link: PostTag): ExportedPostTag {
  const { postId, tagId, taggedAt } = link;
  return { postId, tagId, taggedAt };
}
