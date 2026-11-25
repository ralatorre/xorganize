/**
 * Message shapes shared by the three extension contexts.
 *
 * - Bridge messages travel between the page-context script and the isolated
 *   content script, over the private channel in ./bridge.ts.
 * - Runtime messages travel over `runtime.sendMessage` from the isolated
 *   content script to the background worker.
 *
 * Everything received is validated before use, whichever side it comes from.
 */

import { DIAGNOSTICS } from '@/src/build';
import { isCapturedPost, type CapturedPost } from '@/src/capture/normalise';
import type { SourceKind } from '@/src/capture/operations';
import type { Counts } from '@/src/db/types';
import { isId, isRecord } from '@/src/guards';

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
  items: Array<{ post: CapturedPost; sortIndex?: string }>;
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

/** The worker's answer to a capture message: the account's totals afterwards. */
export type CaptureReply = { ok: true; counts: Counts } | { ok: false };

export type RuntimeMessage = ContentReadyMessage | CaptureMessage | DiagnosticsMessage;

export const MAX_ITEMS = 200;
const SORT_INDEX = /^\d{1,30}$/;

const isSource = (value: unknown): value is SourceKind => value === 'bookmark' || value === 'like';

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value)) return false;
  if (value.type === 'content/ready') return true;
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
            (typeof item.sortIndex === 'string' && SORT_INDEX.test(item.sortIndex))),
      ) &&
      Array.isArray(referenced) &&
      referenced.length <= MAX_ITEMS * 2 &&
      referenced.every(isCapturedPost) &&
      Array.isArray(unavailable) &&
      unavailable.length <= MAX_ITEMS &&
      unavailable.every(isId)
    );
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
