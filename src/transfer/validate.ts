/**
 * Checks a file that claims to be an export (docs/SPEC.md, 12.3). The file is
 * untrusted: it may come from anyone, or be damaged. The whole of it is
 * checked before anything is written, against the same rules as a post
 * captured from X, and the records are rebuilt from known fields only, so
 * nothing else in the file is ever stored.
 */

import { isCapturedPost, type CapturedPost } from '@/src/capture/normalise';
import { isId, isRecord } from '@/src/guards';
import { parseTagName } from '@/src/tags/names';
import { TAG_COLOURS } from '@/src/tags/palette';
import {
  FORMAT_NAME,
  FORMAT_VERSION,
  type ExportHeader,
  type ExportedPost,
  type ExportedPostTag,
  type ExportedTag,
} from './format';

/** The most a file may hold. Far above a real library, low enough to refuse a file that would exhaust memory. */
export interface ImportLimits {
  bytes: number;
  posts: number;
  tags: number;
  postTags: number;
}

export const DEFAULT_IMPORT_LIMITS: Readonly<ImportLimits> = {
  bytes: 512 * 1024 * 1024,
  posts: 1_000_000,
  tags: 10_000,
  postTags: 5_000_000,
};

/** A file that passed every check, ready to import. */
export interface Backup {
  header: ExportHeader;
  /** Names as normalised for storage. */
  tags: ExportedTag[];
  posts: ExportedPost[];
  postTags: ExportedPostTag[];
}

/** Where in the file a record failed its check, counted from 1. */
export interface ProblemAt {
  section: 'tags' | 'posts' | 'postTags';
  position: number;
}

export type BackupProblem =
  | { kind: 'too-large' }
  | { kind: 'unreadable' }
  | { kind: 'not-json' }
  | { kind: 'not-export' }
  | { kind: 'newer-version'; version: number }
  | { kind: 'too-many'; section: ProblemAt['section'] }
  | ({ kind: 'invalid' } & ProblemAt)
  | ({ kind: 'duplicate' } & ProblemAt)
  | ({ kind: 'dangling' } & ProblemAt);

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; problem: BackupProblem };

/** A tag's ID: what this extension generates (a UUID), or anything as plain. */
const TAG_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** A position in a source's list, as `sortKey`, `recentKey` and `unknownKey` write it. */
const SORT_KEY = /^(?:\d{30,64}|[~!]\d{29,63})$/;

const fail = (problem: BackupProblem): ParsedBackup => ({ ok: false, problem });

/** Parses and checks the text of a file of `size` bytes. */
export function parseBackup(
  text: string,
  size: number,
  limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): ParsedBackup {
  if (size > limits.bytes) return fail({ kind: 'too-large' });
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return fail({ kind: 'not-json' });
  }
  if (!isRecord(value) || value.format !== FORMAT_NAME) return fail({ kind: 'not-export' });
  if (typeof value.version === 'number' && value.version > FORMAT_VERSION) {
    return fail({ kind: 'newer-version', version: value.version });
  }
  const header = headerOf(value);
  const { tags, posts, postTags } = value;
  if (!header || !Array.isArray(tags) || !Array.isArray(posts) || !Array.isArray(postTags)) {
    return fail({ kind: 'not-export' });
  }
  if (tags.length > limits.tags) return fail({ kind: 'too-many', section: 'tags' });
  if (posts.length > limits.posts) return fail({ kind: 'too-many', section: 'posts' });
  if (postTags.length > limits.postTags) return fail({ kind: 'too-many', section: 'postTags' });

  const backup: Backup = { header, tags: [], posts: [], postTags: [] };
  const tagIds = new Set<string>();
  const nameKeys = new Set<string>();
  for (const [index, raw] of tags.entries()) {
    const at = { section: 'tags', position: index + 1 } as const;
    const parsed = tagOf(raw);
    if (!parsed) return fail({ kind: 'invalid', ...at });
    if (tagIds.has(parsed.tag.id) || nameKeys.has(parsed.nameKey)) {
      return fail({ kind: 'duplicate', ...at });
    }
    tagIds.add(parsed.tag.id);
    nameKeys.add(parsed.nameKey);
    backup.tags.push(parsed.tag);
  }

  const postIds = new Set<string>();
  for (const [index, raw] of posts.entries()) {
    const at = { section: 'posts', position: index + 1 } as const;
    const parsed = postOf(raw);
    if (!parsed) return fail({ kind: 'invalid', ...at });
    if (postIds.has(parsed.id)) return fail({ kind: 'duplicate', ...at });
    postIds.add(parsed.id);
    backup.posts.push(parsed);
  }

  const links = new Set<string>();
  for (const [index, raw] of postTags.entries()) {
    const at = { section: 'postTags', position: index + 1 } as const;
    const parsed = postTagOf(raw);
    if (!parsed) return fail({ kind: 'invalid', ...at });
    if (!postIds.has(parsed.postId) || !tagIds.has(parsed.tagId)) {
      return fail({ kind: 'dangling', ...at });
    }
    const key = `${parsed.postId} ${parsed.tagId}`;
    if (links.has(key)) return fail({ kind: 'duplicate', ...at });
    links.add(key);
    backup.postTags.push(parsed);
  }
  return { ok: true, backup };
}

const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isFlag = (value: unknown): value is 0 | 1 => value === 0 || value === 1;

function headerOf(value: Record<string, unknown>): ExportHeader | undefined {
  const { version, exportedAt, accountId, scope } = value;
  if (version !== FORMAT_VERSION) return undefined;
  if (typeof exportedAt !== 'string' || !Number.isFinite(Date.parse(exportedAt))) return undefined;
  if (!isId(accountId)) return undefined;
  if (scope !== undefined && scope !== 'partial') return undefined;
  return {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    exportedAt,
    accountId,
    ...(scope === 'partial' ? { scope } : {}),
  };
}

function tagOf(value: unknown): { tag: ExportedTag; nameKey: string } | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, color, createdAt, lastUsedAt } = value;
  if (typeof id !== 'string' || !TAG_ID.test(id) || typeof name !== 'string') return undefined;
  const parsed = parseTagName(name);
  if (!parsed.ok) return undefined;
  if (typeof color !== 'number' || !Number.isInteger(color) || color < 0 || color >= TAG_COLOURS) {
    return undefined;
  }
  if (!isTime(createdAt) || !isTime(lastUsedAt)) return undefined;
  return { tag: { id, name: parsed.name, color, createdAt, lastUsedAt }, nameKey: parsed.nameKey };
}

function postTagOf(value: unknown): ExportedPostTag | undefined {
  if (!isRecord(value)) return undefined;
  const { postId, tagId, taggedAt } = value;
  if (!isId(postId) || typeof tagId !== 'string' || !TAG_ID.test(tagId) || !isTime(taggedAt)) {
    return undefined;
  }
  return { postId, tagId, taggedAt };
}

function postOf(value: unknown): ExportedPost | undefined {
  if (!isRecord(value)) return undefined;
  const content = contentOf(value);
  if (!content || !isCapturedPost(content)) return undefined;

  const { isBookmark, isLike, bookmarkSort, likeSort, partial, unavailable } = value;
  const { firstSeenAt, lastSeenAt, savedAt, unbookmarkedAt, unlikedAt } = value;
  if (!isFlag(isBookmark) || !isFlag(isLike)) return undefined;
  // A position exactly when the post is in that source.
  const sortOf = (flag: 0 | 1, key: unknown) =>
    flag === 1 ? typeof key === 'string' && SORT_KEY.test(key) : key === undefined;
  if (!sortOf(isBookmark, bookmarkSort) || !sortOf(isLike, likeSort)) return undefined;
  if (typeof partial !== 'boolean' || typeof unavailable !== 'boolean') return undefined;
  if (!isTime(firstSeenAt) || !isTime(lastSeenAt) || !isTime(savedAt)) return undefined;
  // When a source was lost: optional, and dropped while the post is in that source.
  if (![unbookmarkedAt, unlikedAt].every((at) => at === undefined || isTime(at))) return undefined;

  return {
    ...content,
    isBookmark,
    isLike,
    ...(typeof bookmarkSort === 'string' ? { bookmarkSort } : {}),
    ...(typeof likeSort === 'string' ? { likeSort } : {}),
    ...(isBookmark === 0 && isTime(unbookmarkedAt) ? { unbookmarkedAt } : {}),
    ...(isLike === 0 && isTime(unlikedAt) ? { unlikedAt } : {}),
    partial,
    unavailable,
    firstSeenAt,
    lastSeenAt,
    savedAt,
  };
}

/** The fields that describe the post itself, copied by name, ready for the capture check. */
function contentOf(value: Record<string, unknown>): CapturedPost | undefined {
  const { author, media, links } = value;
  if (!isRecord(author) || !Array.isArray(media) || !Array.isArray(links)) return undefined;
  if (!media.every(isRecord) || !links.every(isRecord)) return undefined;
  const optional = <K extends string>(key: K, field: unknown) =>
    field === undefined ? {} : ({ [key]: field } as Record<K, unknown>);
  return {
    id: value.id,
    url: value.url,
    text: value.text,
    createdAt: value.createdAt,
    ...optional('lang', value.lang),
    author: {
      handle: author.handle,
      name: author.name,
      ...optional('id', author.id),
      ...optional('avatarUrl', author.avatarUrl),
    },
    media: media.map((item) => ({
      kind: item.kind,
      url: item.url,
      ...optional('previewUrl', item.previewUrl),
      ...optional('alt', item.alt),
    })),
    links: links.map((item) => ({ url: item.url, display: item.display })),
    ...optional('quotedId', value.quotedId),
    sensitive: value.sensitive,
  } as CapturedPost;
}
