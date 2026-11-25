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

export const BRIDGE_VERSION = 1;

/** `open` is used by the channel itself; the rest are application messages. */
const BRIDGE_KINDS = ['open', 'ready'] as const;
export type BridgeKind = (typeof BRIDGE_KINDS)[number];

export interface BridgeMessage {
  v: typeof BRIDGE_VERSION;
  kind: BridgeKind;
}

export function bridgeMessage(kind: BridgeKind): BridgeMessage {
  return { v: BRIDGE_VERSION, kind };
}

export function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!isRecord(value)) return false;
  return (
    value.v === BRIDGE_VERSION &&
    typeof value.kind === 'string' &&
    (BRIDGE_KINDS as readonly string[]).includes(value.kind)
  );
}

/** Sent once per page when both content scripts are running and connected. */
export interface ContentReadyMessage {
  type: 'content/ready';
}

export type RuntimeMessage = ContentReadyMessage;

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return isRecord(value) && value.type === 'content/ready';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
