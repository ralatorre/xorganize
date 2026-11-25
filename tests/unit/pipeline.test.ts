import { describe, expect, it } from 'vitest';
import { createCapture } from '@/src/capture/pipeline';
import type { CaptureMessage, CaptureReply, ResponseMessage } from '@/src/messaging/protocol';
import { isRuntimeMessage } from '@/src/messaging/protocol';
import {
  bookmarksTimeline,
  cursorEntry,
  homeTimeline,
  likesTimeline,
  postEntry,
  rawPost,
  unavailableEntry,
} from '../fixtures/posts';

const VIEWER = '9000000000000000001';

function setup(options: { viewerId?: string | undefined; reply?: CaptureReply | undefined } = {}) {
  const sent: CaptureMessage[] = [];
  const captured: Array<[string, { bookmarks: number; likes: number }]> = [];
  const failures: string[] = [];
  const viewerId = 'viewerId' in options ? options.viewerId : VIEWER;
  const reply =
    'reply' in options ? options.reply : { ok: true, counts: { bookmarks: 3, likes: 1 } };
  const capture = createCapture({
    viewerId: () => viewerId,
    send: async (message) => {
      sent.push(message);
      return reply as CaptureReply | undefined;
    },
    onCaptured: (source, counts) => captured.push([source, counts]),
    onFailed: () => failures.push('failed'),
  });
  return { capture, sent, captured, failures };
}

function response(
  op: string,
  body: unknown,
  overrides: Partial<ResponseMessage> = {},
): ResponseMessage {
  return {
    v: 1,
    kind: 'response',
    op,
    transport: 'xhr',
    host: 'x.com',
    method: 'GET',
    status: 200,
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...overrides,
  };
}

const mutation = (op: string, postId: string, body: unknown = { data: {} }) =>
  response(op, body, {
    method: 'POST',
    requestBody: JSON.stringify({ variables: { tweet_id: postId }, queryId: 'q' }),
  });

const bookmarksPage = bookmarksTimeline([
  postEntry(rawPost({ id: '103', quoted: rawPost({ id: '201' }) }), '9003'),
  postEntry(rawPost({ id: '102' }), '9002'),
  unavailableEntry('101', '9001'),
  cursorEntry('top', '9004'),
  cursorEntry('bottom', '9000'),
]);

describe('source timelines', () => {
  it('sends a bookmarks page to be stored, and reports the totals', async () => {
    const { capture, sent, captured } = setup();

    await capture(response('Bookmarks', bookmarksPage));

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'capture/posts',
      accountId: VIEWER,
      source: 'bookmark',
      unavailable: ['101'],
    });
    const message = sent[0] as Extract<CaptureMessage, { type: 'capture/posts' }>;
    expect(message.items.map((item) => [item.post.id, item.sortIndex])).toEqual([
      ['103', '9003'],
      ['102', '9002'],
    ]);
    expect(message.referenced.map((post) => post.id)).toEqual(['201']);
    expect(captured).toEqual([['bookmark', { bookmarks: 3, likes: 1 }]]);
  });

  it('sends messages the worker will accept', async () => {
    const { capture, sent } = setup();

    await capture(response('Bookmarks', bookmarksPage));
    await capture(mutation('DeleteBookmark', '102'));

    expect(sent).toHaveLength(2);
    for (const message of sent) expect(isRuntimeMessage(message)).toBe(true);
  });

  it('stores the account’s own likes', async () => {
    const { capture, sent } = setup();
    const page = likesTimeline([postEntry(rawPost({ id: '301' }), '9001')]);

    await capture(response('Likes', page, { variables: JSON.stringify({ userId: VIEWER }) }));

    expect(sent).toMatchObject([{ type: 'capture/posts', source: 'like' }]);
  });

  it.each([
    ['someone else’s', JSON.stringify({ userId: '123' })],
    ['an unidentified account’s', JSON.stringify({ count: 20 })],
    ['unreadable variables’', 'not json'],
    ['missing variables’', undefined],
  ])('does not store %s likes', async (_label, variables) => {
    const { capture, sent } = setup();
    const page = likesTimeline([postEntry(rawPost({ id: '301' }), '9001')]);

    await capture(response('Likes', page, variables === undefined ? {} : { variables }));

    expect(sent).toEqual([]);
  });

  it('stores nothing when the account cannot be identified', async () => {
    const { capture, sent } = setup({ viewerId: undefined });

    await capture(response('Bookmarks', bookmarksPage));
    await capture(mutation('DeleteBookmark', '102'));

    expect(sent).toEqual([]);
  });

  it('stores nothing for a page with no posts, such as the end of the list', async () => {
    const { capture, sent } = setup();

    await capture(response('Bookmarks', bookmarksTimeline([cursorEntry('bottom', '1')])));

    expect(sent).toEqual([]);
  });

  it.each([
    ['an error status', { status: 429 }],
    ['a body that is not JSON', { body: '<html>' }],
    ['a body that is not an object', { body: '[]' }],
  ])('ignores a response with %s', async (_label, overrides) => {
    const { capture, sent } = setup();

    await capture(response('Bookmarks', bookmarksPage, overrides));

    expect(sent).toEqual([]);
  });

  it('says so, and reports no totals, when the worker fails or does not answer', async () => {
    for (const reply of [{ ok: false } as const, undefined]) {
      const { capture, captured, failures } = setup({ reply });

      await capture(response('Bookmarks', bookmarksPage));
      await capture(mutation('DeleteBookmark', '102'));

      expect(captured).toEqual([]);
      expect(failures).toEqual(['failed', 'failed']);
    }
  });

  it('reports no failure when things work, or when there was nothing to store', async () => {
    const { capture, failures } = setup();

    await capture(response('Bookmarks', bookmarksPage));
    await capture(response('HomeTimeline', bookmarksPage));
    await capture(response('Bookmarks', bookmarksTimeline([cursorEntry('bottom', '1')])));

    expect(failures).toEqual([]);
  });
});

describe('other timelines', () => {
  it('remembers their posts without storing them', async () => {
    const { capture, sent } = setup();

    await capture(response('HomeTimeline', homeTimeline([postEntry(rawPost({ id: '401' }), '1')])));

    expect(sent).toEqual([]);
  });

  it('ignores operations it does not know', async () => {
    const { capture, sent } = setup();

    await capture(response('DMInbox', bookmarksPage));
    await capture(response('constructor', bookmarksPage));

    expect(sent).toEqual([]);
  });
});

describe('changes the user makes', () => {
  it('stores a post the user bookmarks, using what was seen of it', async () => {
    const { capture, sent, captured } = setup();
    const seen = rawPost({ id: '401', text: 'Seen on the home timeline', favorited: true });
    await capture(response('HomeTimeline', homeTimeline([postEntry(seen, '1')])));

    await capture(mutation('CreateBookmark', '401', { data: { tweet_bookmark_put: 'Done' } }));

    expect(sent).toHaveLength(1);
    const message = sent[0] as Extract<CaptureMessage, { type: 'capture/posts' }>;
    expect(message).toMatchObject({ type: 'capture/posts', source: 'bookmark', accountId: VIEWER });
    expect(message.items).toHaveLength(1);
    expect(message.items[0]?.post.text).toBe('Seen on the home timeline');
    expect(message.items[0]?.sortIndex).toBeUndefined();
    expect(captured).toHaveLength(1);
  });

  it('leaves out the possibly stale bookmark and like state of a remembered post', async () => {
    const { capture, sent } = setup();
    const seen = rawPost({ id: '401', bookmarked: false, favorited: false });
    await capture(response('HomeTimeline', homeTimeline([postEntry(seen, '1')])));

    await capture(mutation('FavoriteTweet', '401'));

    const message = sent[0] as Extract<CaptureMessage, { type: 'capture/posts' }>;
    expect(message.source).toBe('like');
    expect(message.items[0]?.post).not.toHaveProperty('bookmarked');
    expect(message.items[0]?.post).not.toHaveProperty('liked');
  });

  it('remembers posts quoted inside others, too', async () => {
    const { capture, sent } = setup();
    const outer = rawPost({ id: '401', quoted: rawPost({ id: '402' }) });
    await capture(response('HomeTimeline', homeTimeline([postEntry(outer, '1')])));

    await capture(mutation('CreateBookmark', '402'));

    expect(sent).toHaveLength(1);
  });

  it('does not store a post it never saw', async () => {
    const { capture, sent } = setup();

    await capture(mutation('CreateBookmark', '999'));

    expect(sent).toEqual([]);
  });

  it.each([
    ['DeleteBookmark', 'bookmark'],
    ['UnfavoriteTweet', 'like'],
  ])('clears the source on %s, whether or not the post was seen', async (op, source) => {
    const { capture, sent } = setup();

    await capture(mutation(op, '999'));

    expect(sent).toEqual([{ type: 'capture/clear', accountId: VIEWER, source, postId: '999' }]);
  });

  it('ignores a change the site rejected', async () => {
    const { capture, sent } = setup();

    await capture(mutation('DeleteBookmark', '102', { errors: [{ message: 'nope' }] }));
    await capture({ ...mutation('DeleteBookmark', '102'), status: 403 });

    expect(sent).toEqual([]);
  });

  it.each([
    ['no request body', undefined],
    ['a request body that is not JSON', 'tweet_id=102'],
    ['no post id', JSON.stringify({ variables: {} })],
    ['a post id that is not a number', JSON.stringify({ variables: { tweet_id: '../x' } })],
  ])('ignores a change with %s', async (_label, requestBody) => {
    const { capture, sent } = setup();

    await capture(
      response('DeleteBookmark', { data: {} }, requestBody === undefined ? {} : { requestBody }),
    );

    expect(sent).toEqual([]);
  });
});
