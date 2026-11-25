/**
 * Routes what arrives over the bridge from the page-context script. It knows
 * which message means what. The content script's entrypoint supplies what to
 * do about each.
 */

import type { BridgeMessage, ResponseMessage } from '@/src/messaging/protocol';

export interface ContentDependencies {
  /** Tells the worker that both content scripts are running and connected. */
  announce(): void;
  /** Stores whatever the response holds. */
  capture(message: ResponseMessage): Promise<void>;
  /** Diagnostics build only: also describes each response's structure. */
  diagnostics?: { onResponse(message: ResponseMessage): void };
}

export function createContentHandler(deps: ContentDependencies) {
  return (message: BridgeMessage): void => {
    if (message.kind === 'ready') {
      deps.announce();
      return;
    }
    if (message.kind !== 'response') return;
    // Capture never throws into the page, whatever the response held.
    void deps.capture(message).catch(() => {});
    deps.diagnostics?.onResponse(message);
  };
}
