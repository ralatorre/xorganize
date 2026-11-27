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

  it.each(['light', 'dim', 'dark'])('accepts the theme seen on x.com: %s', (theme) => {
    expect(isRuntimeMessage({ type: 'theme/seen', theme })).toBe(true);
  });

  it.each([undefined, 'sepia', 'Dark', 1, { theme: 'dark' }])(
    'rejects a theme that is not one of X’s: %j',
    (theme) => {
      expect(isRuntimeMessage({ type: 'theme/seen', theme })).toBe(false);
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

describe('capture messages', () => {
  const account = '9000000000000000001';
  const post = {
    id: '101',
    url: 'https://x.com/example_user/status/101',
    text: 'Lorem ipsum.',
    createdAt: null,
    author: { handle: 'example_user', name: 'Example User' },
    media: [],
    links: [],
    sensitive: false,
  };
  const posts = {
    type: 'capture/posts',
    accountId: account,
    source: 'bookmark',
    items: [{ post, sortIndex: '9001' }, { post }],
    referenced: [post],
    unavailable: ['102'],
  };
  const clear = { type: 'capture/clear', accountId: account, source: 'like', postId: '101' };

  it('accepts well-formed messages', () => {
    expect(isRuntimeMessage(posts)).toBe(true);
    expect(isRuntimeMessage(clear)).toBe(true);
  });

  it.each([
    ['a non-numeric account', { accountId: 'me' }],
    ['an unknown source', { source: 'retweet' }],
    ['a missing source', { source: undefined }],
    ['items that are not a list', { items: {} }],
    ['too many items', { items: Array.from({ length: 201 }, () => ({ post })) }],
    ['a malformed post', { items: [{ post: { ...post, url: 'https://evil.example/' } }] }],
    ['a non-numeric sort index', { items: [{ post, sortIndex: 'first' }] }],
    ['a malformed referenced post', { referenced: [{ ...post, id: 'abc' }] }],
    ['a non-numeric unavailable id', { unavailable: ['../../etc'] }],
  ])('rejects posts with %s', (_label, change) => {
    expect(isRuntimeMessage({ ...posts, ...change })).toBe(false);
  });

  it.each([
    ['a non-numeric account', { accountId: '' }],
    ['an unknown source', { source: 'all' }],
    ['a non-numeric post id', { postId: 'x' }],
  ])('rejects a clear with %s', (_label, change) => {
    expect(isRuntimeMessage({ ...clear, ...change })).toBe(false);
  });
});
