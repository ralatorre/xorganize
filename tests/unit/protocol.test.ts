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

describe('response messages', () => {
  const valid = {
    v: 1,
    kind: 'response',
    op: 'Bookmarks',
    transport: 'xhr',
    host: 'x.com',
    method: 'GET',
    status: 200,
    body: '{}',
  };

  it('accepts a well-formed response, with or without the optional fields', () => {
    expect(isBridgeMessage(valid)).toBe(true);
    expect(isBridgeMessage({ ...valid, variables: '{}', requestBody: '{}' })).toBe(true);
  });

  it.each([
    ['an operation name with other characters', { op: 'Book marks' }],
    ['an empty operation name', { op: '' }],
    ['an overlong operation name', { op: 'x'.repeat(65) }],
    ['an unknown transport', { transport: 'beacon' }],
    ['a host with a path', { host: 'x.com/evil' }],
    ['a lower-case method', { method: 'get' }],
    ['a non-integer status', { status: 200.5 }],
    ['a non-string body', { body: {} }],
    ['an oversized body', { body: 'x'.repeat(8 * 1024 * 1024 + 1) }],
    ['oversized variables', { variables: 'x'.repeat(64 * 1024 + 1) }],
    ['a non-string request body', { requestBody: 1 }],
  ])('rejects %s', (_label, change) => {
    expect(isBridgeMessage({ ...valid, ...change })).toBe(false);
  });
});
