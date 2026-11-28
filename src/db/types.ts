import type { CapturedLink, CapturedMedia } from '@/src/capture/normalise';
import type { Theme } from '@/src/dom/theme';

export type PostId = string; // decimal string, larger than a JavaScript number holds
export type AccountId = string;
export type TagId = string;

/** A stored post. Indexed flags are 0 or 1, because booleans cannot be IndexedDB keys. */
export interface StoredPost {
  accountId: AccountId;
  id: PostId;
  url: string;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number | null;
  lang?: string;
  author: { id?: string; handle: string; name: string; avatarUrl?: string };
  media: CapturedMedia[];
  links: CapturedLink[];
  quotedId?: PostId;
  sensitive: boolean;

  isBookmark: 0 | 1;
  isLike: 0 | 1;
  /** Maintained by the repository whenever tags change. */
  hasTags: 0 | 1;
  /** Position among bookmarks. Present exactly when isBookmark is 1. See sortKey(). */
  bookmarkSort?: string;
  /** Position among likes. Present exactly when isLike is 1. */
  likeSort?: string;

  /** Built from the page, not from the API, and waiting to be completed. */
  partial: boolean;
  /** No longer available on X. The stored copy is all there is. */
  unavailable: boolean;
  firstSeenAt: number;
  /** When it was last stored from X. Every capture sets it, so search reads only what changed. */
  lastSeenAt: number;
  /** When it entered the library. */
  savedAt: number;
}

export interface Tag {
  accountId: AccountId;
  id: TagId;
  /** As the user typed it. */
  name: string;
  /** Normalised for comparison: NFKC, trimmed, lower-cased. */
  nameKey: string;
  /** Index into the tag palette. */
  color: number;
  createdAt: number;
  lastUsedAt: number;
}

export interface PostTag {
  accountId: AccountId;
  postId: PostId;
  tagId: TagId;
  taggedAt: number;
}

export interface Meta {
  /** Empty for values that are not tied to one account. */
  accountId: AccountId | '';
  key: string;
  value: unknown;
}

export interface Counts {
  bookmarks: number;
  likes: number;
}

/**
 * The library's theme: `x` follows the theme last seen on x.com, `system`
 * the system's light or dark setting, and the rest are fixed.
 */
export type ThemeSetting = 'x' | 'system' | Theme;

/** Preferences, kept in the `meta` table so that no `storage` permission is needed. */
export interface Settings {
  /** Show avatars and media thumbnails, which the browser loads from X's image server. */
  remoteImages: boolean;
  /** Days after the last backup before the library reminds the user to make one. 0: never. */
  backupReminderDays: number;
  theme: ThemeSetting;
}

/** When the account's library was last backed up, and what else the backup reminder counts from. */
/** What this browser holds for one X account (DESIGN, 4.7). */
export interface StoredAccount {
  accountId: AccountId;
  /** The @handle last seen on x.com for it, without the @, if it has been seen. */
  handle?: string;
  posts: number;
  tags: number;
  /** Tags on posts. */
  assignments: number;
}

export interface BackupTimes {
  /** The last whole-library JSON export. */
  lastBackupAt?: number;
  /** When the reminder was last put off. */
  dismissedAt?: number;
  /** When the oldest post in the library entered it. */
  startedAt?: number;
}

/** What is shown of a tag on a post: enough to draw a chip. */
export interface TagSummary {
  id: TagId;
  name: string;
  color: number;
}

/** A tag offered while typing, with how many posts carry it. */
export interface TagSuggestion extends TagSummary {
  count: number;
}
