import { describe, expect, it } from 'vitest';
import { accountCookieStatus, pageKind } from '@/src/diagnostics/environment';
import { observe } from '@/src/diagnostics/observe';
import { buildReport, mergeEnvironment, mergeOperation } from '@/src/diagnostics/report';
import type { ResponseMessage } from '@/src/messaging/protocol';
import {
  MARKER,
  VIEWER_ID,
  bookmarksResponse,
  createBookmarkRequest,
  createBookmarkResponse,
  likesResponse,
} from '../fixtures/timeline';

function response(overrides: Partial<ResponseMessage>): ResponseMessage {
  return {
    v: 1,
    kind: 'response',
    op: 'Bookmarks',
    transport: 'xhr',
    host: 'x.com',
    method: 'GET',
    status: 200,
    body: JSON.stringify(bookmarksResponse),
    ...overrides,
  };
}

describe('observe', () => {
  it('summarises a timeline response without its content', () => {
    const summary = observe(
      response({ variables: JSON.stringify({ count: 20, cursor: `${MARKER}-cursor` }) }),
      VIEWER_ID,
    );

    expect(summary).toMatchObject({
      op: 'Bookmarks',
      transport: 'xhr',
      parseable: true,
      timeline: { entries: 4, tweetResults: 3, sortIndexDescending: true },
      variableKeys: ['.count', '.cursor'],
      userIdIsViewer: null,
    });
    expect(JSON.stringify(summary)).not.toContain(MARKER);
    expect(JSON.stringify(summary)).not.toContain(VIEWER_ID);
  });

  it('says whether a timeline belongs to the logged-in account, without recording either id', () => {
    const own = observe(
      response({
        op: 'Likes',
        body: JSON.stringify(likesResponse),
        variables: JSON.stringify({ userId: VIEWER_ID }),
      }),
      VIEWER_ID,
    );
    const other = observe(
      response({ op: 'Likes', variables: JSON.stringify({ userId: '123' }) }),
      VIEWER_ID,
    );
    const unknown = observe(
      response({ op: 'Likes', variables: JSON.stringify({ userId: VIEWER_ID }) }),
      undefined,
    );

    expect(own.userIdIsViewer).toBe(true);
    expect(other.userIdIsViewer).toBe(false);
    expect(unknown.userIdIsViewer).toBeNull();
    expect(JSON.stringify(own)).not.toContain(VIEWER_ID);
  });

  it('records the keys of a mutation request, not its values', () => {
    const summary = observe(
      response({
        op: 'CreateBookmark',
        method: 'POST',
        body: JSON.stringify(createBookmarkResponse),
        requestBody: JSON.stringify(createBookmarkRequest),
      }),
      VIEWER_ID,
    );

    expect(summary.requestBodyKeys).toEqual(['.queryId', '.variables.tweet_id']);
    expect(JSON.stringify(summary)).not.toContain(MARKER);
    expect(JSON.stringify(summary)).not.toContain(createBookmarkRequest.variables.tweet_id);
  });

  it('copes with a body that is not JSON', () => {
    const summary = observe(response({ body: `<html>${MARKER}</html>` }), VIEWER_ID);

    expect(summary.parseable).toBe(false);
    expect(summary.shape).toBeUndefined();
    expect(JSON.stringify(summary)).not.toContain(MARKER);
  });

  it('counts top-level errors', () => {
    const summary = observe(
      response({ body: JSON.stringify({ errors: [{ message: MARKER }] }) }),
      VIEWER_ID,
    );

    expect(summary.errors).toBe(1);
    expect(JSON.stringify(summary)).not.toContain(MARKER);
  });
});

describe('mergeOperation', () => {
  it('accumulates responses for one operation', () => {
    const first = observe(response({ transport: 'xhr' }), VIEWER_ID);
    const second = observe(
      response({ transport: 'fetch', status: 429, body: JSON.stringify({ errors: [{}] }) }),
      VIEWER_ID,
    );

    const record = mergeOperation(mergeOperation(undefined, first), second);

    expect(record).toMatchObject({
      op: 'Bookmarks',
      responses: 2,
      transports: ['fetch', 'xhr'],
      statuses: [200, 429],
      responsesWithErrors: 1,
      entriesPerResponse: [4, 0],
      entriesTotal: 4,
      tweetResultsTotal: 3,
      sortIndexDescending: { yes: 1, no: 0 },
      userIdIsViewer: { yes: 0, no: 0, unknown: 2 },
    });
    expect(record.paths['.errors']).toEqual(['array']);
    expect(record.entryIdPatterns).toEqual(['cursor-bottom-<n>', 'tweet-<n>']);
  });
});

describe('mergeEnvironment', () => {
  it('keeps the highest count seen for each selector', () => {
    const base = { page: '/i/bookmarks', accountCookie: 'ok' };
    const selectors = (post: number, likeButton: number) =>
      ({ post, likeButton }) as never as Parameters<typeof mergeEnvironment>[1]['selectors'];

    const record = mergeEnvironment(
      mergeEnvironment(undefined, { ...base, selectors: selectors(3, 0) }),
      { ...base, selectors: selectors(1, 5) },
    );

    expect(record).toEqual({
      page: '/i/bookmarks',
      observations: 2,
      accountCookie: ['ok'],
      selectors: { post: 3, likeButton: 5 },
    });
  });
});

describe('buildReport', () => {
  it('sorts its contents and carries no content from the responses', () => {
    const likes = mergeOperation(
      undefined,
      observe(response({ op: 'Likes', body: JSON.stringify(likesResponse) }), VIEWER_ID),
    );
    const bookmarks = mergeOperation(undefined, observe(response({}), VIEWER_ID));

    const report = buildReport([likes, bookmarks], []);

    expect(report.operations.map((operation) => operation.op)).toEqual(['Bookmarks', 'Likes']);
    expect(JSON.stringify(report)).not.toContain(MARKER);
    expect(JSON.stringify(report)).not.toMatch(/\d{10,}/);
  });
});

describe('pageKind', () => {
  it.each([
    ['/', '/'],
    ['/home', '/home'],
    ['/i/bookmarks', '/i/bookmarks'],
    [`/${MARKER}_handle`, '/<handle>'],
    [`/${MARKER}_handle/likes`, '/<handle>/likes'],
    [`/${MARKER}_handle/status/1700000000000000001`, '/<handle>/status/<n>'],
    [`/search/${MARKER}`, '/search/<other>'],
  ])('reduces %s to %s', (pathname, kind) => {
    expect(pageKind(pathname)).toBe(kind);
  });
});

describe('accountCookieStatus', () => {
  it('reports the expected format without the id', () => {
    expect(accountCookieStatus(`a=1; twid=u%3D${VIEWER_ID}`)).toBe('ok');
  });

  it('reports a missing cookie', () => {
    expect(accountCookieStatus('a=1')).toBe('absent');
  });

  it('masks an unexpected format', () => {
    expect(accountCookieStatus('twid=user:12ab')).toBe('unexpected:aaaa:99aa');
  });
});
