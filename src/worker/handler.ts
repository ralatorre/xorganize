/**
 * Decides what the background worker does with a runtime message: who may
 * send it, what it means, and what is replied. It never touches browser APIs
 * or the database itself. The worker's entrypoint hands it those.
 */

import { DIAGNOSTICS } from '@/src/build';
import type { Counts } from '@/src/db/types';
import type { EnvironmentObservation } from '@/src/diagnostics/environment';
import type { OperationObservation } from '@/src/diagnostics/observe';
import { isSupportedUrl } from '@/src/hosts';
import {
  isRuntimeMessage,
  type CaptureClearMessage,
  type CapturePostsMessage,
  type CaptureReply,
  type DiagnosticsMessage,
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

/** Diagnostics build only: where content-free observations are recorded. */
export interface DiagnosticsSink {
  recordOperation(seen: OperationObservation): Promise<void>;
  recordEnvironment(seen: EnvironmentObservation): Promise<void>;
}

export interface WorkerDependencies {
  /** This extension's own id. Messages from anything else are ignored. */
  extensionId: string;
  store: CaptureStore;
  /** Present only in the diagnostics build. Without it, diagnostics messages are ignored. */
  diagnostics?: DiagnosticsSink;
}

export type Reply = CaptureReply | { ok: boolean };

/**
 * Returns a handler that answers a message with a reply that never rejects,
 * or with undefined when the message is to be ignored.
 */
export function createWorkerHandler(deps: WorkerDependencies) {
  return (message: unknown, sender: MessageSender): Promise<Reply> | undefined => {
    // Only this extension's own content scripts, in the top frame of a supported page.
    if (sender.id !== deps.extensionId || sender.frameId !== 0) return undefined;
    if (!isSupportedUrl(sender.url) || !isRuntimeMessage(message)) return undefined;

    if (message.type === 'content/ready') return Promise.resolve({ ok: true });

    if (message.type === 'capture/posts' || message.type === 'capture/clear') {
      const stored =
        message.type === 'capture/posts' ? deps.store.save(message) : deps.store.clear(message);
      return stored.then(
        (counts): CaptureReply => ({ ok: true, counts }),
        (): CaptureReply => ({ ok: false }),
      );
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
