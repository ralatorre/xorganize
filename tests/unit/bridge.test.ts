import { describe, expect, it } from 'vitest';
import { connectBridge, type BridgeRole } from '@/src/messaging/bridge';
import { bridgeMessage, type BridgeMessage } from '@/src/messaging/protocol';

const HELLO = 'xorganize:hello';
const ready = bridgeMessage('ready');

/** Connects both sides to one target, in the given order. */
function connectBoth(first: BridgeRole, target = new EventTarget()) {
  const received: Record<BridgeRole, BridgeMessage[]> = { page: [], extension: [] };
  const second: BridgeRole = first === 'page' ? 'extension' : 'page';
  const bridges = {} as Record<BridgeRole, ReturnType<typeof connectBridge>>;
  for (const role of [first, second]) {
    bridges[role] = connectBridge(role, (message) => received[role].push(message), target);
  }
  return { target, received, bridges };
}

describe.each<BridgeRole>(['page', 'extension'])('when the %s script starts first', (first) => {
  it('delivers messages in both directions', () => {
    const { bridges, received } = connectBoth(first);

    bridges.page.send(ready);
    bridges.extension.send(ready);

    expect(received.extension).toEqual([ready]);
    expect(received.page).toEqual([ready]);
  });

  it('does not deliver a script its own messages or the internal open message', () => {
    const { bridges, received } = connectBoth(first);

    bridges.page.send(ready);

    expect(received.page).toEqual([]);
    expect(received.extension).toEqual([ready]);
  });
});

describe('before the other script has started', () => {
  it('queues messages and delivers them in order once connected', () => {
    const target = new EventTarget();
    const received: BridgeMessage[] = [];

    const page = connectBridge('page', () => {}, target);
    page.send(ready);
    page.send(ready);
    expect(received).toEqual([]);

    connectBridge('extension', (message) => received.push(message), target);
    expect(received).toEqual([ready, ready]);
  });
});

describe('a page script that arrives after the handshake', () => {
  it('sees no handshake and cannot start one', () => {
    const { target, bridges, received } = connectBoth('page');

    const seen: string[] = [];
    const forgedId = 'forged-channel-id-0000';
    target.addEventListener(HELLO, () => seen.push('hello'));
    target.addEventListener(`${forgedId}:page`, () => seen.push('accepted as page'));
    target.addEventListener(`${forgedId}:extension`, () => seen.push('accepted as extension'));

    // Real traffic continues, and the page pretends to be each script in turn.
    bridges.page.send(ready);
    for (const role of ['page', 'extension']) {
      target.dispatchEvent(
        new CustomEvent(HELLO, { detail: JSON.stringify({ role, id: forgedId }) }),
      );
    }

    expect(seen).toEqual(['hello', 'hello']); // only its own two dispatches
    expect(received.extension).toEqual([ready]);
  });

  it('cannot inject messages without knowing the channel id', () => {
    const { target, received } = connectBoth('extension');

    for (const name of ['guess:page', 'guess:extension', ':page', 'undefined:page']) {
      target.dispatchEvent(new CustomEvent(name, { detail: JSON.stringify(ready) }));
    }

    expect(received.page).toEqual([]);
    expect(received.extension).toEqual([]);
  });
});

describe('malformed input during the handshake', () => {
  it.each([
    ['not json', 'not json'],
    ['a non-string detail', { role: 'extension', id: 'x'.repeat(20) }],
    ['the wrong role', JSON.stringify({ role: 'page', id: 'x'.repeat(20) })],
    ['an unknown role', JSON.stringify({ role: 'admin', id: 'x'.repeat(20) })],
    ['a short id', JSON.stringify({ role: 'extension', id: 'x' })],
    ['an oversized id', JSON.stringify({ role: 'extension', id: 'x'.repeat(500) })],
    ['a missing id', JSON.stringify({ role: 'extension' })],
  ])('ignores an offer with %s', (_label, detail) => {
    const target = new EventTarget();
    const received: BridgeMessage[] = [];
    const page = connectBridge('page', (message) => received.push(message), target);

    target.dispatchEvent(new CustomEvent(HELLO, { detail }));

    // Still waiting: a genuine extension script can connect afterwards.
    const fromPage: BridgeMessage[] = [];
    connectBridge('extension', (message) => fromPage.push(message), target);
    page.send(ready);
    expect(fromPage).toEqual([ready]);
    expect(received).toEqual([]);
  });
});
