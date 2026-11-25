/**
 * The content scripts listening for tag changes, one port each. Kept in
 * memory only: when the browser stops the worker the ports close, and each
 * content script reconnects when it next needs to.
 */

/** The part of a runtime port this module uses. */
export interface Subscriber {
  postMessage(message: unknown): void;
  onDisconnect: { addListener(listener: () => void): void };
}

export function createSubscribers<Message>() {
  const subscribers = new Set<Subscriber>();
  return {
    add(subscriber: Subscriber): void {
      subscribers.add(subscriber);
      subscriber.onDisconnect.addListener(() => subscribers.delete(subscriber));
    },
    broadcast(message: Message): void {
      for (const subscriber of subscribers) {
        try {
          subscriber.postMessage(message);
        } catch {
          // The page went away between its port closing and the browser saying so.
          subscribers.delete(subscriber);
        }
      }
    },
    get size(): number {
      return subscribers.size;
    },
  };
}
