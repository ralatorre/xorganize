import { describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import type { TagChange } from '@/src/db/tags';
import type { Counts, TagSummary } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';
import type {
  CaptureClearMessage,
  CapturePostsMessage,
  TagsChangedMessage,
} from '@/src/messaging/protocol';
import {
  createEditRelay,
  createWorkerHandler,
  isTrustedSender,
  type MessageSender,
} from '@/src/worker/handler';
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

const RUST: TagSummary = { id: 'tag-1', name: 'rust', color: 0 };

function setup(outcome: 'stored' | 'failed' = 'stored') {
  const saved: CapturePostsMessage[] = [];
  const cleared: CaptureClearMessage[] = [];
  const changes: TagChange[] = [];
  const notified: TagsChangedMessage[] = [];
  const themes: Theme[] = [];
  const handles: string[] = [];
  const result = <T>(value: T) =>
    outcome === 'stored' ? Promise.resolve(value) : Promise.reject(new Error('quota'));
  const handle = createWorkerHandler({
    extensionId: EXTENSION,
    store: {
      save: (message) => (saved.push(message), result(COUNTS)),
      clear: (message) => (cleared.push(message), result(COUNTS)),
    },
    tags: {
      forPosts: (_, postIds) =>
        result(new Map(postIds.map((id) => [id, id === '101' ? [RUST] : []]))),
      suggest: (_, query) =>
        result({ suggestions: [{ ...RUST, count: query.length }], recent: [RUST] }),
      set: (change) => (changes.push(change), result([RUST])),
    },
    recordTheme: (theme) => (themes.push(theme), result(undefined)),
    recordProfile: (accountId, profile) => (
      handles.push(`${accountId} ${JSON.stringify(profile)}`),
      result(undefined)
    ),
    notify: (message) => void notified.push(message),
  });
  return { handle, saved, cleared, changes, notified, themes, handles };
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

  it('keeps the theme x.com shows, for the library', async () => {
    const { handle, themes } = setup();
    expect(await handle({ type: 'theme/seen', theme: 'dim' }, FROM_X)).toEqual({ ok: true });
    expect(themes).toEqual(['dim']);
  });

  it('says so when the theme cannot be kept, without rejecting', async () => {
    const message = { type: 'theme/seen', theme: 'dark' };
    expect(await setup('failed').handle(message, FROM_X)).toEqual({ ok: false });
  });

  it('keeps the handle and picture x.com shows for an account, and nothing else', async () => {
    const { handle, handles } = setup();
    const id = '9000000000000000001';
    const seen = { type: 'account/seen', accountId: id, handle: 'some_one' };
    expect(await handle(seen, FROM_X)).toEqual({ ok: true });
    const pictured = {
      ...seen,
      avatarUrl: 'https://pbs.twimg.com/profile_images/1/abc_normal.jpg',
      extra: 'dropped',
    };
    expect(await handle(pictured, FROM_X)).toEqual({ ok: true });
    expect(handles).toEqual([
      `${id} {"handle":"some_one"}`,
      `${id} {"handle":"some_one","avatarUrl":"https://pbs.twimg.com/profile_images/1/abc_normal.jpg"}`,
    ]);
  });

  it('says so when the handle cannot be kept, without rejecting', async () => {
    const message = { type: 'account/seen', accountId: '9000000000000000001', handle: 'some_one' };
    expect(await setup('failed').handle(message, FROM_X)).toEqual({ ok: false });
  });

  it('ignores a theme from anywhere but x.com', () => {
    const { handle, themes } = setup();
    const sender = { ...FROM_X, url: 'https://evil.example/' };
    expect(handle({ type: 'theme/seen', theme: 'dark' }, sender)).toBeUndefined();
    expect(themes).toEqual([]);
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

describe('tag messages', () => {
  it('answers with the tags of each post asked about', async () => {
    const { handle } = setup();
    expect(
      await handle({ type: 'tags/for-posts', accountId: ACCOUNT, postIds: ['101', '102'] }, FROM_X),
    ).toEqual({
      ok: true,
      posts: [
        { postId: '101', tags: [RUST] },
        { postId: '102', tags: [] },
      ],
    });
  });

  it('answers with suggestions and recent tags', async () => {
    const { handle } = setup();
    expect(
      await handle({ type: 'tags/suggest', accountId: ACCOUNT, query: 'ru', limit: 5 }, FROM_X),
    ).toEqual({ ok: true, suggestions: [{ ...RUST, count: 2 }], recent: [RUST] });
  });

  it('changes a post’s tags and tells every listening page', async () => {
    const { handle, changes, notified } = setup();
    const post = normalisePost(rawPost({ id: '101' }))!;
    const reply = await handle(
      {
        type: 'tags/set',
        accountId: ACCOUNT,
        postId: '101',
        add: ['rust'],
        remove: [],
        post,
        partial: false,
      },
      FROM_X,
    );
    expect(reply).toEqual({ ok: true, tags: [RUST] });
    expect(changes).toEqual([
      { accountId: ACCOUNT, postId: '101', add: ['rust'], remove: [], post, partial: false },
    ]);
    expect(notified).toEqual([
      { type: 'tags/changed', accountId: ACCOUNT, postId: '101', tags: [RUST] },
    ]);
  });

  it('says so when a tag change fails, and tells no one', async () => {
    const { handle, notified } = setup('failed');
    const message = {
      type: 'tags/set',
      accountId: ACCOUNT,
      postId: '101',
      add: ['rust'],
      remove: [],
    };
    expect(await handle(message, FROM_X)).toEqual({ ok: false });
    expect(
      await handle({ type: 'tags/for-posts', accountId: ACCOUNT, postIds: [] }, FROM_X),
    ).toEqual({
      ok: false,
    });
    expect(notified).toEqual([]);
  });

  it('ignores tag messages from anywhere else', () => {
    const { handle, changes } = setup();
    const message = {
      type: 'tags/set',
      accountId: ACCOUNT,
      postId: '101',
      add: ['rust'],
      remove: [],
    };
    expect(handle(message, { ...FROM_X, frameId: 1 })).toBeUndefined();
    expect(changes).toEqual([]);
  });
});

describe('isTrustedSender', () => {
  it('trusts only this extension, in the top frame, on x.com', () => {
    expect(isTrustedSender(FROM_X, EXTENSION)).toBe(true);
    expect(isTrustedSender({ ...FROM_X, id: 'other' }, EXTENSION)).toBe(false);
    expect(isTrustedSender({ ...FROM_X, frameId: 2 }, EXTENSION)).toBe(false);
    expect(isTrustedSender({ ...FROM_X, url: 'https://evil.example/' }, EXTENSION)).toBe(false);
  });
});

describe('createEditRelay', () => {
  it('tells the content scripts to catch up after an edit in the library, and ignores the rest', () => {
    const sent: unknown[] = [];
    const relay = createEditRelay((message) => void sent.push(message));
    relay({ type: 'tags/edited', accountId: ACCOUNT });
    relay({ type: 'tags/edited', accountId: 'not an id' });
    relay({ type: 'tags/changed', accountId: ACCOUNT });
    relay('junk');
    relay(undefined);
    expect(sent).toEqual([{ type: 'tags/refresh', accountId: ACCOUNT }]);
  });
});
