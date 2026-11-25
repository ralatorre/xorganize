import { describe, expect, it } from 'vitest';
import { createSubscribers, type Subscriber } from '@/src/worker/subscribers';

function port(fails = false) {
  const received: unknown[] = [];
  const listeners: Array<() => void> = [];
  const subscriber: Subscriber = {
    postMessage: (message) => {
      if (fails) throw new Error('disconnected');
      received.push(message);
    },
    onDisconnect: { addListener: (listener) => void listeners.push(listener) },
  };
  return { subscriber, received, disconnect: () => listeners.forEach((listener) => listener()) };
}

describe('createSubscribers', () => {
  it('sends to every open port, and stops once one closes', () => {
    const subscribers = createSubscribers<string>();
    const one = port();
    const two = port();
    subscribers.add(one.subscriber);
    subscribers.add(two.subscriber);

    subscribers.broadcast('first');
    two.disconnect();
    subscribers.broadcast('second');

    expect(one.received).toEqual(['first', 'second']);
    expect(two.received).toEqual(['first']);
    expect(subscribers.size).toBe(1);
  });

  it('drops a port that can no longer be written to', () => {
    const subscribers = createSubscribers<string>();
    const broken = port(true);
    const working = port();
    subscribers.add(broken.subscriber);
    subscribers.add(working.subscriber);

    subscribers.broadcast('hello');

    expect(working.received).toEqual(['hello']);
    expect(subscribers.size).toBe(1);
  });
});
