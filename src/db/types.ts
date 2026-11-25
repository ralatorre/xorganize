import type { CapturedLink, CapturedMedia } from '@/src/capture/normalise';

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
