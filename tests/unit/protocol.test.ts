import { describe, expect, it } from 'vitest';
import { bridgeMessage, isBridgeMessage, isRuntimeMessage } from '@/src/messaging/protocol';

describe('bridge messages', () => {
  it('round-trips the messages it builds', () => {
    expect(isBridgeMessage(bridgeMessage('open'))).toBe(true);
    expect(isBridgeMessage(bridgeMessage('ready'))).toBe(true);
  });

  it.each([
    null,
    undefined,
    'ready',
    42,
    [],
    {},
    { v: 1 },
    { v: 1, kind: 'unknown' },
    { v: 2, kind: 'ready' },
    { v: 1, kind: 7 },
  ])('rejects %j', (value) => {
    expect(isBridgeMessage(value)).toBe(false);
  });
});

describe('runtime messages', () => {
  it('accepts the content-ready message', () => {
    expect(isRuntimeMessage({ type: 'content/ready' })).toBe(true);
  });

  it.each([null, undefined, 'content/ready', {}, { type: 'other' }, { type: 1 }])(
    'rejects %j',
    (value) => {
      expect(isRuntimeMessage(value)).toBe(false);
    },
  );
});
