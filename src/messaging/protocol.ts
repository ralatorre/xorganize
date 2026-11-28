/**
 * Message shapes shared by the three extension contexts.
 *
 * - Bridge messages travel between the page-context script and the isolated
 *   content script, over the private channel in ./bridge.ts.
 * - Runtime messages travel over `runtime.sendMessage` from the isolated
 *   content script to the background worker.
 * - Port messages travel from the worker to content scripts over a
 *   `runtime.connect` port, to keep tag state on the page current.
 * - Channel notices travel from extension pages to the worker over a
 *   `BroadcastChannel`, which only the extension's own origin can use.
 *
 * Everything received is validated before use, whichever side it comes from.
 */

import { DIAGNOSTICS } from '@/src/build';
import { isCapturedPost, type CapturedPost } from '@/src/capture/normalise';
import type { SourceKind } from '@/src/capture/operations';
import type { Counts, TagSuggestion, TagSummary } from '@/src/db/types';
import { isTheme, type Theme } from '@/src/dom/theme';
import { isHandle, isId, isRecord } from '@/src/guards';
import { MAX_TAG_NAME, parseTagName } from '@/src/tags/names';

export { isRecord };

export const BRIDGE_VERSION = 1;

/** Used by the channel itself to accept an offer. */
export interface OpenMessage {
  v: typeof BRIDGE_VERSION;
  kind: 'open';
}

/** Sent by the page-context script once it is running. */
export interface ReadyMessage {
  v: typeof BRIDGE_VERSION;
  kind: 'ready';
}

/** One response the page's client received, as observed by the interceptor. */
export interface ResponseMessage {
  v: typeof BRIDGE_VERSION;
  kind: 'response';
  /** GraphQL operation name, taken from the request URL. */
  op: string;
  transport: 'fetch' | 'xhr';
  host: string;
  method: string;
  status: number;
  /** The `variables` query parameter, as raw JSON text. */
  variables?: string;
  /** The request body, as raw text, when it was a short string. */
  requestBody?: string;
  /** The response body, as raw text. */
  body: string;
}

export type BridgeMessage = OpenMessage | ReadyMessage | ResponseMessage;

export const MAX_BODY_LENGTH = 8 * 1024 * 1024;
export const MAX_REQUEST_LENGTH = 64 * 1024;

const OPERATION_NAME = /^[A-Za-z0-9_]{1,64}$/;
const HOST = /^[a-z0-9.-]{1,100}(?::\d{1,5})?$/;
const METHOD = /^[A-Z]{1,10}$/;

export function bridgeMessage(kind: 'open' | 'ready'): OpenMessage | ReadyMessage {
  return { v: BRIDGE_VERSION, kind };
}

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!isRecord(value) || value.v !== BRIDGE_VERSION) return false;
  if (value.kind === 'open' || value.kind === 'ready') return true;
  if (value.kind !== 'response') return false;
  return (
    typeof value.op === 'string' &&
    OPERATION_NAME.test(value.op) &&
    (value.transport === 'fetch' || value.transport === 'xhr') &&
    typeof value.host === 'string' &&
    HOST.test(value.host) &&
    typeof value.method === 'string' &&
    METHOD.test(value.method) &&
    Number.isInteger(value.status) &&
    isOptionalText(value.variables, MAX_REQUEST_LENGTH) &&
    isOptionalText(value.requestBody, MAX_REQUEST_LENGTH) &&
    typeof value.body === 'string' &&
    value.body.length <= MAX_BODY_LENGTH
  );
}

/** Sent once per page when both content scripts are running and connected. */
export interface ContentReadyMessage {
  type: 'content/ready';
}

/** Diagnostics build only: a content-free summary. See src/diagnostics. */
export interface DiagnosticsMessage {
  type: 'diagnostics/operation' | 'diagnostics/environment';
  payload: Record<string, unknown>;
}

/** Posts to store: a page of a bookmarks or likes timeline, or one the user just added. */
export interface CapturePostsMessage {
  type: 'capture/posts';
  accountId: string;
  /** The timeline the items belong to. */
  source: SourceKind;
  items: Array<{ post: CapturedPost; sortIndex?: string; partial?: boolean }>;
  /** Posts the items refer to, such as quoted posts. */
  referenced: CapturedPost[];
  /** Ids of posts X reports as no longer available. */
  unavailable: string[];
}

/** The user removed a bookmark or a like. */
export interface CaptureClearMessage {
  type: 'capture/clear';
  accountId: string;
  source: SourceKind;
  postId: string;
}

export type CaptureMessage = CapturePostsMessage | CaptureClearMessage;

/** The theme x.com shows, for the library's Match X. Sent when first read and when it changes. */
export interface ThemeSeenMessage {
  type: 'theme/seen';
  theme: Theme;
}

/**
 * The signed-in account's @handle, as x.com shows it, for the library's
 * header. Sent when first read on a page and when it changes.
 */
export interface AccountSeenMessage {
  type: 'account/seen';
  accountId: string;
  /** Without the @. */
  handle: string;
}

/** The worker's answer to a capture message: the account's totals afterwards. */
export type CaptureReply = { ok: true; counts: Counts } | { ok: false };

/** The tags on posts that are on screen. */
export interface TagsForPostsMessage {
  type: 'tags/for-posts';
  accountId: string;
  postIds: string[];
}

/** Tags matching what the user has typed, and the most recently used ones. */
export interface TagsSuggestMessage {
  type: 'tags/suggest';
  accountId: string;
  query: string;
  limit: number;
}

/** Adds and removes tags on one post. */
export interface TagsSetMessage {
  type: 'tags/set';
  accountId: string;
  postId: string;
  /** Tag names, created as needed. */
  add: string[];
  /** Tag ids. */
  remove: string[];
  /** The post, from what the page loaded, in case it is not stored yet. */
  post?: CapturedPost;
  /** True when `post` was read from the page rather than the API. */
  partial?: boolean;
}

export type TagMessage = TagsForPostsMessage | TagsSuggestMessage | TagsSetMessage;

export type TagsForPostsReply =
  { ok: true; posts: Array<{ postId: string; tags: TagSummary[] }> } | { ok: false };
export type TagsSuggestReply =
  { ok: true; suggestions: TagSuggestion[]; recent: TagSummary[] } | { ok: false };
export type TagsSetReply = { ok: true; tags: TagSummary[] } | { ok: false };

/** Name of the port content scripts open to hear about tag changes. */
export const TAGS_PORT = 'tags';

/** Sent to every open tags port after a post's tags change. */
export interface TagsChangedMessage {
  type: 'tags/changed';
  accountId: string;
  postId: string;
  tags: TagSummary[];
}

/**
 * Sent to every open tags port when tags changed in a way that touches many
 * posts at once, such as a rename in the library: the page asks again for
 * the tags of every post it shows.
 */
export interface TagsRefreshMessage {
  type: 'tags/refresh';
  accountId: string;
}

export type PortMessage = TagsChangedMessage | TagsRefreshMessage;

/**
 * The channel extension pages announce their tag edits on. A
 * `BroadcastChannel` reaches only contexts of the same origin, so neither
 * x.com nor the content scripts running there can hear or send on it. The
 * worker passes each notice on to the content scripts as `tags/refresh`.
 */
export const TAGS_CHANNEL = 'xorganize-tags';

/** An extension page changed the tags of an account. */
export interface TagsEditedNotice {
  type: 'tags/edited';
  accountId: string;
}

export function isTagsEditedNotice(value: unknown): value is TagsEditedNotice {
  return isRecord(value) && value.type === 'tags/edited' && isId(value.accountId);
}

export type RuntimeMessage =
  | ContentReadyMessage
  | CaptureMessage
  | ThemeSeenMessage
  | AccountSeenMessage
  | TagMessage
  | DiagnosticsMessage;

export const MAX_ITEMS = 200;
/** Posts per tags/for-posts request: more than a screen holds. */
export const MAX_TAG_POSTS = 100;
/** Suggestions per tags/suggest request. */
export const MAX_SUGGESTIONS = 20;
/** Tags added or removed in one tags/set request. */
export const MAX_TAG_CHANGES = 20;
const TAG_ID = /^[A-Za-z0-9-]{1,64}$/;
const SORT_INDEX = /^\d{1,30}$/;

const isSource = (value: unknown): value is SourceKind => value === 'bookmark' || value === 'like';

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value)) return false;
  if (value.type === 'content/ready') return true;
  if (value.type === 'theme/seen') return isTheme(value.theme);
  if (value.type === 'account/seen') return isId(value.accountId) && isHandle(value.handle);
  if (value.type === 'capture/clear') {
    return isId(value.accountId) && isSource(value.source) && isId(value.postId);
  }
  if (value.type === 'capture/posts') {
    const { items, referenced, unavailable } = value;
    return (
      isId(value.accountId) &&
      isSource(value.source) &&
      Array.isArray(items) &&
      items.length <= MAX_ITEMS &&
      items.every(
        (item) =>
          isRecord(item) &&
          isCapturedPost(item.post) &&
          (item.sortIndex === undefined ||
            (typeof item.sortIndex === 'string' && SORT_INDEX.test(item.sortIndex))) &&
          (item.partial === undefined || typeof item.partial === 'boolean'),
      ) &&
      Array.isArray(referenced) &&
      referenced.length <= MAX_ITEMS * 2 &&
      referenced.every(isCapturedPost) &&
      Array.isArray(unavailable) &&
      unavailable.length <= MAX_ITEMS &&
      unavailable.every(isId)
    );
  }
  if (
    value.type === 'tags/for-posts' ||
    value.type === 'tags/suggest' ||
    value.type === 'tags/set'
  ) {
    return isTagMessage(value);
  }
  // Production neither sends nor accepts diagnostics messages.
  if (!DIAGNOSTICS) return false;
  return (
    (value.type === 'diagnostics/operation' || value.type === 'diagnostics/environment') &&
    isRecord(value.payload)
  );
}

function isOptionalText(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= max);
}

export function isTagId(value: unknown): value is string {
  return typeof value === 'string' && TAG_ID.test(value);
}

function isTagMessage(value: Record<string, unknown>): boolean {
  if (!isId(value.accountId)) return false;
  if (value.type === 'tags/for-posts') {
    const { postIds } = value;
    return Array.isArray(postIds) && postIds.length <= MAX_TAG_POSTS && postIds.every(isId);
  }
  if (value.type === 'tags/suggest') {
    return (
      typeof value.query === 'string' &&
      value.query.length <= MAX_TAG_NAME * 4 &&
      Number.isInteger(value.limit) &&
      (value.limit as number) >= 1 &&
      (value.limit as number) <= MAX_SUGGESTIONS
    );
  }
  const { add, remove, post } = value;
  return (
    isId(value.postId) &&
    Array.isArray(add) &&
    add.length <= MAX_TAG_CHANGES &&
    add.every((name) => typeof name === 'string' && parseTagName(name).ok) &&
    Array.isArray(remove) &&
    remove.length <= MAX_TAG_CHANGES &&
    remove.every(isTagId) &&
    (post === undefined || (isCapturedPost(post) && post.id === value.postId)) &&
    (value.partial === undefined || typeof value.partial === 'boolean')
  );
}
