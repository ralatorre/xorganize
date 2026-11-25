/**
 * Diagnostics build only. Sends a content-free summary of each response to
 * the worker and, once the page has settled, a count of what each selector
 * finds on it.
 */

import type { DiagnosticsMessage, ResponseMessage } from '@/src/messaging/protocol';
import type { EnvironmentObservation } from './environment';
import { observe } from './observe';

/** How long the page must go without a new response before it is probed. */
export const SETTLE_MS = 1500;

export interface ForwarderDependencies {
  send(message: DiagnosticsMessage): void;
  viewerId(): string | undefined;
  observePage(): EnvironmentObservation;
  /** Runs `task` after `ms` milliseconds. Returns a function that cancels it. */
  schedule(task: () => void, ms: number): () => void;
  settleMs?: number;
}

export function createDiagnosticsForwarder(deps: ForwarderDependencies) {
  const settleMs = deps.settleMs ?? SETTLE_MS;
  let cancelProbe: (() => void) | undefined;

  return {
    onResponse(message: ResponseMessage): void {
      // Only a description of the response's structure leaves the content script.
      const summary = observe(message, deps.viewerId());
      deps.send({ type: 'diagnostics/operation', payload: { ...summary } });

      cancelProbe?.();
      cancelProbe = deps.schedule(() => {
        deps.send({ type: 'diagnostics/environment', payload: { ...deps.observePage() } });
      }, settleMs);
    },
  };
}
