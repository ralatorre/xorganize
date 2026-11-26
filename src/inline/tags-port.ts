/**
 * Listens for tag changes made in other tabs and in the library. The port opens when first
 * needed, and again after the browser closes it (it does whenever it stops
 * the worker), never by itself, so an idle page keeps no worker running.
 */

import type { TagSummary } from '@/src/db/types';
import { isId, isRecord } from '@/src/guards';
import { isTagId } from '@/src/messaging/protocol';

/** The part of a runtime port this module uses. */
export interface ListeningPort {
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface TagsListenerDependencies {
  connect(): ListeningPort;
  accountId(): string | undefined;
  onChange(postId: string, tags: TagSummary[]): void;
  /**
   * The tags of any post may have changed: after reconnecting, since changes
   * made in between were not heard, and after an edit in the library.
   */
  onStale(): void;
}

export function createTagsListener(deps: TagsListenerDependencies) {
  let port: ListeningPort | undefined;
  let everConnected = false;

  return {
    /** Opens the port unless it is open already. */
    ensure(): void {
      if (port) return;
      try {
        port = deps.connect();
      } catch {
        return; // the extension was reloaded or removed; nothing to listen to
      }
      const current = port;
      current.onDisconnect.addListener(() => {
        if (port === current) port = undefined;
      });
      current.onMessage.addListener((message) => {
        if (isTagsRefresh(message) && message.accountId === deps.accountId()) deps.onStale();
        if (!isTagsChanged(message) || message.accountId !== deps.accountId()) return;
        deps.onChange(message.postId, message.tags);
      });
      if (everConnected) deps.onStale();
      everConnected = true;
    },
  };
}

function isTagsChanged(
  value: unknown,
): value is { accountId: string; postId: string; tags: TagSummary[] } {
  return (
    isRecord(value) &&
    value.type === 'tags/changed' &&
    isId(value.accountId) &&
    isId(value.postId) &&
    Array.isArray(value.tags) &&
    value.tags.every(
      (tag) =>
        isRecord(tag) &&
        isTagId(tag.id) &&
        typeof tag.name === 'string' &&
        Number.isInteger(tag.color),
    )
  );
}

function isTagsRefresh(value: unknown): value is { accountId: string } {
  return isRecord(value) && value.type === 'tags/refresh' && isId(value.accountId);
}
