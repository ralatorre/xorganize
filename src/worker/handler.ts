/**
 * Decides what the background worker does with a runtime message: who may
 * send it, what it means, and what is replied. It never touches browser APIs
 * or the database itself. The worker's entrypoint hands it those.
 */

import { DIAGNOSTICS } from '@/src/build';
import type { TagChange } from '@/src/db/tags';
import type { Counts, TagSuggestion, TagSummary } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';
import type { EnvironmentObservation } from '@/src/diagnostics/environment';
import type { OperationObservation } from '@/src/diagnostics/observe';
import { isSupportedUrl } from '@/src/hosts';
import {
  isRuntimeMessage,
  isTagsEditedNotice,
  type CaptureClearMessage,
  type CapturePostsMessage,
  type CaptureReply,
  type DiagnosticsMessage,
  type TagMessage,
  type TagsChangedMessage,
  type TagsRefreshMessage,
  type TagsForPostsReply,
  type TagsSetReply,
  type TagsSuggestReply,
} from '@/src/messaging/protocol';

/** Where a message came from, as the browser reports it. */
export interface MessageSender {
  id?: string;
  frameId?: number;
  url?: string;
}

/** Where captured posts are written. */
export interface CaptureStore {
  save(message: CapturePostsMessage): Promise<Counts>;
  clear(message: CaptureClearMessage): Promise<Counts>;
}

/** Where tags are read and written. */
export interface TagStore {
  forPosts(accountId: string, postIds: string[]): Promise<Map<string, TagSummary[]>>;
  suggest(
    accountId: string,
    query: string,
    limit: number,
  ): Promise<{ suggestions: TagSuggestion[]; recent: TagSummary[] }>;
  set(change: TagChange): Promise<TagSummary[]>;
}

/** Diagnostics build only: where content-free observations are recorded. */
export interface DiagnosticsSink {
  recordOperation(seen: OperationObservation): Promise<void>;
  recordEnvironment(seen: EnvironmentObservation): Promise<void>;
}

export interface WorkerDependencies {
  /** This extension's own id. Messages from anything else are ignored. */
  extensionId: string;
  store: CaptureStore;
  tags: TagStore;
  /** Keeps the theme x.com shows, for the library's Match X. */
  recordTheme(theme: Theme): Promise<unknown>;
  /** Keeps the @handle x.com shows for an account, for the library's header. */
  recordHandle(accountId: string, handle: string): Promise<unknown>;
  /** Tells every listening page that a post's tags changed. */
  notify(message: TagsChangedMessage): void;
  /** Present only in the diagnostics build. Without it, diagnostics messages are ignored. */
  diagnostics?: DiagnosticsSink;
}

export type Reply =
  CaptureReply | TagsForPostsReply | TagsSuggestReply | TagsSetReply | { ok: boolean };

/** True for this extension's own content scripts, in the top frame of a supported page. */
export function isTrustedSender(sender: MessageSender, extensionId: string): boolean {
  return sender.id === extensionId && sender.frameId === 0 && isSupportedUrl(sender.url);
}

/**
 * Returns a handler that answers a message with a reply that never rejects,
 * or with undefined when the message is to be ignored.
 */
export function createWorkerHandler(deps: WorkerDependencies) {
  return (message: unknown, sender: MessageSender): Promise<Reply> | undefined => {
    if (!isTrustedSender(sender, deps.extensionId) || !isRuntimeMessage(message)) return undefined;

    if (message.type === 'content/ready') return Promise.resolve({ ok: true });

    if (message.type === 'theme/seen' || message.type === 'account/seen') {
      const recorded =
        message.type === 'theme/seen'
          ? deps.recordTheme(message.theme)
          : deps.recordHandle(message.accountId, message.handle);
      return recorded.then(
        () => ({ ok: true }),
        () => ({ ok: false }),
      );
    }

    if (message.type === 'capture/posts' || message.type === 'capture/clear') {
      const stored =
        message.type === 'capture/posts' ? deps.store.save(message) : deps.store.clear(message);
      return stored.then(
        (counts): CaptureReply => ({ ok: true, counts }),
        (): CaptureReply => ({ ok: false }),
      );
    }

    if (
      message.type === 'tags/for-posts' ||
      message.type === 'tags/suggest' ||
      message.type === 'tags/set'
    ) {
      return handleTags(deps, message);
    }

    // Folded at build time, so production bundles carry none of this.
    if (DIAGNOSTICS && deps.diagnostics) return record(deps.diagnostics, message);
    return undefined;
  };
}

function record(diagnostics: DiagnosticsSink, message: DiagnosticsMessage): Promise<Reply> {
  const { payload } = message;
  const recorded =
    message.type === 'diagnostics/operation' && typeof payload.op === 'string'
      ? diagnostics.recordOperation(payload as unknown as OperationObservation)
      : message.type === 'diagnostics/environment' && typeof payload.page === 'string'
        ? diagnostics.recordEnvironment(payload as unknown as EnvironmentObservation)
        : Promise.reject(new Error('malformed diagnostics message'));
  return recorded.then(
    () => ({ ok: true }),
    () => ({ ok: false }),
  );
}

function handleTags(deps: WorkerDependencies, message: TagMessage): Promise<Reply> {
  const failed = (): Reply => ({ ok: false });
  if (message.type === 'tags/for-posts') {
    return deps.tags.forPosts(message.accountId, message.postIds).then(
      (found): TagsForPostsReply => ({
        ok: true,
        posts: [...found].map(([postId, tags]) => ({ postId, tags })),
      }),
      failed,
    );
  }
  if (message.type === 'tags/suggest') {
    return deps.tags
      .suggest(message.accountId, message.query, message.limit)
      .then((found): TagsSuggestReply => ({ ok: true, ...found }), failed);
  }
  const { accountId, postId } = message;
  return deps.tags
    .set({
      accountId,
      postId,
      add: message.add,
      remove: message.remove,
      ...(message.post ? { post: message.post } : {}),
      ...(message.partial !== undefined ? { partial: message.partial } : {}),
    })
    .then((tags): TagsSetReply => {
      deps.notify({ type: 'tags/changed', accountId, postId, tags });
      return { ok: true, tags };
    }, failed);
}

/**
 * Passes an extension page's notice that it edited tags (`TAGS_CHANNEL`) on
 * to the content scripts, which then ask again for what they show. Anything
 * that is not such a notice is ignored.
 */
export function createEditRelay(notify: (message: TagsRefreshMessage) => void) {
  return (notice: unknown): void => {
    if (isTagsEditedNotice(notice)) notify({ type: 'tags/refresh', accountId: notice.accountId });
  };
}
