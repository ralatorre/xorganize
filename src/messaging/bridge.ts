/**
 * A private channel between the page-context script and the isolated content
 * script, which share the page's DOM but nothing else.
 *
 * The page must not be able to tell that the extension is present, read what
 * passes between the two scripts, or inject messages of its own. So the
 * channel avoids `window.postMessage`, which every script on the page can
 * observe. Instead:
 *
 * 1. Both scripts run at `document_start`, before any page script exists.
 *    Each one synchronously offers a random channel id through a DOM event.
 *    Event dispatch is synchronous, so whichever script runs second reaches
 *    the first, and the exchange is over before the page can listen for it.
 * 2. All later traffic uses event names derived from that random id, which
 *    the page never sees and cannot guess.
 * 3. The DOM functions used here are captured when this module loads, so a
 *    page that later replaces them on the prototype sees none of the traffic.
 */

import { bridgeMessage, isBridgeMessage, isRecord, type BridgeMessage } from './protocol';

export type BridgeRole = 'page' | 'extension';

export interface Bridge {
  /** Queued until the channel is open, then delivered in order. */
  send(message: BridgeMessage): void;
}

const HELLO = 'xorganize:hello';
const MAX_QUEUED = 100;

// Captured at load: see point 3 above.
const listen = EventTarget.prototype.addEventListener;
const unlisten = EventTarget.prototype.removeEventListener;
const dispatch = EventTarget.prototype.dispatchEvent;
const PrivateEvent = CustomEvent;
const encode = JSON.stringify;
const decode = JSON.parse;
const randomId = (): string => crypto.randomUUID();

interface Offer {
  role: BridgeRole;
  id: string;
}

export function connectBridge(
  role: BridgeRole,
  onMessage: (message: BridgeMessage) => void,
  target: EventTarget = document,
): Bridge {
  const peer: BridgeRole = role === 'page' ? 'extension' : 'page';
  const queue: BridgeMessage[] = [];
  let channel: string | undefined;

  const emit = (name: string, payload: unknown) => {
    // Payloads cross between JavaScript worlds as strings only.
    dispatch.call(target, new PrivateEvent(name, { detail: encode(payload) }));
  };

  const open = (id: string) => {
    channel = id;
    for (const message of queue.splice(0)) emit(`${id}:${role}`, message);
  };

  /** Listens for the peer on channel `id`. Returns a function that stops listening. */
  const receive = (id: string): (() => void) => {
    const name = `${id}:${peer}`;
    const listener = (event: Event) => {
      const message = read(event);
      if (!isBridgeMessage(message)) return;
      if (message.kind === 'open') {
        // The peer accepted our offer.
        if (channel === undefined) open(id);
      } else if (channel === id) {
        onMessage(message);
      }
    };
    listen.call(target, name, listener);
    return () => unlisten.call(target, name, listener);
  };

  // Offer a channel of our own, in case the other script is already listening.
  const ownId = randomId();
  const withdrawOffer = receive(ownId);
  emit(HELLO, { role, id: ownId } satisfies Offer);

  if (channel === undefined) {
    // Nobody answered, so this script ran first. Wait for the other one's offer.
    const onHello = (event: Event) => {
      const offer = read(event);
      if (channel !== undefined || !isOffer(offer) || offer.role !== peer) return;
      stopWaiting();
      withdrawOffer();
      receive(offer.id);
      channel = offer.id;
      emit(`${offer.id}:${role}`, bridgeMessage('open'));
      open(offer.id);
    };
    const stopWaiting = () => unlisten.call(target, HELLO, onHello);
    listen.call(target, HELLO, onHello);

    // Both scripts start before the page's own scripts. If the other one has
    // not appeared by the time the document is parsed, it is not coming, and
    // a listener left behind would let the page probe for the extension.
    listen.call(target, 'DOMContentLoaded', stopWaiting, { once: true });
  }

  return {
    send(message) {
      if (channel !== undefined) emit(`${channel}:${role}`, message);
      else if (queue.length < MAX_QUEUED) queue.push(message);
    },
  };
}

function read(event: Event): unknown {
  const detail: unknown = (event as CustomEvent).detail;
  if (typeof detail !== 'string') return undefined;
  try {
    return decode(detail);
  } catch {
    return undefined;
  }
}

function isOffer(value: unknown): value is Offer {
  return (
    isRecord(value) &&
    (value.role === 'page' || value.role === 'extension') &&
    typeof value.id === 'string' &&
    value.id.length >= 16 &&
    value.id.length <= 64
  );
}
