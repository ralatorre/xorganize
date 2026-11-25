import { describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import type { Counts } from '@/src/db/types';
import type { CaptureClearMessage, CapturePostsMessage } from '@/src/messaging/protocol';
import { createWorkerHandler, type MessageSender } from '@/src/worker/handler';
import { rawPost } from '../fixtures/posts';

const EXTENSION = 'own-extension-id';
const ACCOUNT = '9000000000000000001';
const COUNTS: Counts = { bookmarks: 2, likes: 1 };
const FROM_X: MessageSender = { id: EXTENSION, frameId: 0, url: 'https://x.com/i/bookmarks' };

const posts: CapturePostsMessage = {
  type: 'capture/posts',
  accountId: ACCOUNT,
  source: 'bookmark',
  items: [{ post: normalisePost(rawPost({ id: '101' }))!, sortIndex: '9001' }],
  referenced: [],
  unavailable: [],
};
const clear: CaptureClearMessage = {
  type: 'capture/clear',
  accountId: ACCOUNT,
  source: 'like',
  postId: '101',
};

function setup(outcome: 'stored' | 'failed' = 'stored') {
  const saved: CapturePostsMessage[] = [];
  const cleared: CaptureClearMessage[] = [];
  const result = () =>
    outcome === 'stored' ? Promise.resolve(COUNTS) : Promise.reject(new Error('quota'));
  const handle = createWorkerHandler({
    extensionId: EXTENSION,
    store: {
      save: (message) => (saved.push(message), result()),
      clear: (message) => (cleared.push(message), result()),
    },
  });
  return { handle, saved, cleared };
}

describe('createWorkerHandler', () => {
  it('stores captured posts and replies with the new totals', async () => {
    const { handle, saved } = setup();
    expect(await handle(posts, FROM_X)).toEqual({ ok: true, counts: COUNTS });
    expect(saved).toEqual([posts]);
  });

  it('clears a source and replies with the new totals', async () => {
    const { handle, cleared } = setup();
    expect(await handle(clear, FROM_X)).toEqual({ ok: true, counts: COUNTS });
    expect(cleared).toEqual([clear]);
  });

  it('says so when storing fails, without rejecting', async () => {
    const { handle } = setup('failed');
    expect(await handle(posts, FROM_X)).toEqual({ ok: false });
    expect(await handle(clear, FROM_X)).toEqual({ ok: false });
  });

  it('answers a content script that has connected', async () => {
    expect(await setup().handle({ type: 'content/ready' }, FROM_X)).toEqual({ ok: true });
  });

  it.each<[string, MessageSender]>([
    ['another extension', { ...FROM_X, id: 'someone-else' }],
    ['no extension', { frameId: 0, url: FROM_X.url }],
    ['a subframe', { ...FROM_X, frameId: 3 }],
    ['another site', { ...FROM_X, url: 'https://evil.example/' }],
    ['a look-alike host', { ...FROM_X, url: 'https://x.com.evil.example/' }],
    ['no page', { id: EXTENSION, frameId: 0 }],
  ])('ignores messages from %s', (_, sender) => {
    const { handle, saved } = setup();
    expect(handle(posts, sender)).toBeUndefined();
    expect(saved).toEqual([]);
  });

  it.each<[string, unknown]>([
    ['an unknown type', { type: 'capture/everything' }],
    ['a malformed capture', { ...posts, accountId: 'not-an-id' }],
    ['a non-object', 'capture/posts'],
    // The production build neither sends nor accepts these.
    ['a diagnostics message', { type: 'diagnostics/operation', payload: { op: 'Bookmarks' } }],
  ])('ignores %s', (_, message) => {
    const { handle, saved, cleared } = setup();
    expect(handle(message, FROM_X)).toBeUndefined();
    expect([...saved, ...cleared]).toEqual([]);
  });
});
