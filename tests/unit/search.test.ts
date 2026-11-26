import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import { postChanges, postsAfter, saveCapture } from '@/src/db/repo';
import { LibraryDatabase } from '@/src/db/schema';
import { setPostTags } from '@/src/db/tags';
import { SEARCH_FAILED, SEARCHING, summaryOf } from '@/src/library/format';
import { isSearchShortcut, isTyping, type KeyPress } from '@/src/library/shortcuts';
import { createSearchClient, type SearchOutcome } from '@/src/search/client';
import {
  MAX_TERMS,
  isSearchReply,
  isSearchRequest,
  type SearchReply,
  type SearchRequest,
} from '@/src/search/protocol';
import { MAX_QUERY, matchesToken, parseQuery } from '@/src/search/query';
import { createSearchService, type SearchService } from '@/src/search/service';
import { searchKey, searchTextOf } from '@/src/search/text';
import { TextIndex } from '@/src/search/text-index';
import { rawPost, type RawPostOptions } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';

describe('searchKey', () => {
  it('ignores case, accents and compatibility forms', () => {
    expect(searchKey('Café NAÏVE')).toBe('cafe naive');
    expect(searchKey('ｆｕｌｌ ①')).toBe('full 1');
    expect(searchKey('İstanbul')).toBe('istanbul');
  });

  it('keeps scripts written without spaces', () => {
    expect(searchKey('東京タワー')).toBe(searchKey('東京タワー'));
    expect(searchKey('東京タワー')).toContain(searchKey('東京'));
  });

  it('finds a post by its text, handle and name', () => {
    const text = searchTextOf({ text: 'Hello', author: { handle: 'Some_One', name: 'Zoë' } });
    expect(text).toContain('hello');
    expect(text).toContain('some_one');
    expect(text).toContain('zoe');
  });
});

describe('parseQuery', () => {
  it('splits words, and keeps quoted phrases whole', () => {
    expect(parseQuery('  Rust   "Type Script" ').terms).toEqual(['rust', 'type script']);
    expect(parseQuery('"unclosed phrase').terms).toEqual(['unclosed phrase']);
  });

  it('lifts out tags and authors, the last one still being typed', () => {
    expect(parseQuery('#Rust text @Some_One #"To  Read" @ali')).toEqual({
      terms: ['text'],
      tags: [
        { value: 'rust', prefix: false },
        { value: 'to read', prefix: false },
      ],
      authors: [
        { value: 'some_one', prefix: false },
        { value: 'ali', prefix: true },
      ],
    });
    expect(parseQuery('#ru').tags).toEqual([{ value: 'ru', prefix: true }]);
    expect(parseQuery('#ru ').tags).toEqual([{ value: 'ru', prefix: false }]);
    expect(parseQuery('#"to r').tags).toEqual([{ value: 'to r', prefix: true }]);
  });

  it('drops a lone `#`, `@` or empty quotes', () => {
    expect(parseQuery('# @ "" #""')).toEqual({ terms: [], tags: [], authors: [] });
  });

  it('reads no more than the longest query', () => {
    expect(parseQuery(`${'a'.repeat(MAX_QUERY)}b`).terms).toEqual(['a'.repeat(MAX_QUERY)]);
  });

  it('matches whole names, or how they start for the token being typed', () => {
    expect(matchesToken({ value: 'ru', prefix: true }, 'rust')).toBe(true);
    expect(matchesToken({ value: 'ru', prefix: false }, 'rust')).toBe(false);
    expect(matchesToken({ value: 'rust', prefix: false }, 'rust')).toBe(true);
  });
});

describe('TextIndex', () => {
  const entry = (id: string, text: string, handle = 'h', name = 'n') => ({
    id,
    text,
    author: { handle, name },
  });

  it('finds posts containing every term, by any part of a word', () => {
    const index = new TextIndex();
    index.put(entry('1', 'Rust and TypeScript'));
    index.put(entry('2', 'Only rust'));
    index.put(entry('3', 'see https://example.com/page'));
    expect(index.match(['rust'])).toEqual(['1', '2']);
    expect(index.match(['rust', 'script'])).toEqual(['1']);
    expect(index.match(['example.com'])).toEqual(['3']);
    expect(index.match(['missing'])).toEqual([]);
    expect(index.match([])).toEqual(['1', '2', '3']);
  });

  it('finds posts by one of the authors, ignoring case, the last by how it starts', () => {
    const index = new TextIndex();
    index.put(entry('1', 'one', 'Alice'));
    index.put(entry('2', 'two', 'alicia'));
    index.put(entry('3', 'three', 'bob'));
    const author = (value: string, prefix = false) => ({ value, prefix });
    expect(index.match([], [author('alice')])).toEqual(['1']);
    expect(index.match([], [author('ali', true)])).toEqual(['1', '2']);
    expect(index.match([], [author('ali')])).toEqual([]);
    expect(index.match([], [author('alice'), author('bob')])).toEqual(['1', '3']);
    expect(index.match(['two'], [author('ali', true)])).toEqual(['2']);
  });

  it('says whether a put or a removal changed anything', () => {
    const index = new TextIndex();
    expect(index.put(entry('1', 'a'))).toBe(true);
    expect(index.put(entry('1', 'a'))).toBe(false);
    expect(index.put(entry('1', 'b'))).toBe(true);
    expect(index.put(entry('1', 'b', 'other'))).toBe(true);
    index.put(entry('2', 'c'));
    expect(index.keepOnly(['1', '2'])).toBe(false);
    expect(index.keepOnly(['2'])).toBe(true);
    expect(index.size).toBe(1);
    expect(index.match(['b'])).toEqual([]);
  });
});

describe('search messages', () => {
  const request: SearchRequest = {
    kind: 'search',
    seq: 1,
    accountId: ACCOUNT,
    terms: ['a'],
    authors: [{ value: 'b', prefix: true }],
  };

  it('accepts well-formed requests and replies', () => {
    expect(isSearchRequest(request)).toBe(true);
    expect(isSearchReply({ kind: 'results', seq: 1, ids: ['1'] })).toBe(true);
    expect(isSearchReply({ kind: 'failed', seq: 1 })).toBe(true);
  });

  it('refuses anything else', () => {
    for (const bad of [
      null,
      'search',
      { ...request, kind: 'other' },
      { ...request, seq: 1.5 },
      { ...request, accountId: '' },
      { ...request, terms: 'a' },
      { ...request, terms: [1] },
      { ...request, terms: Array.from({ length: MAX_TERMS + 1 }, () => 'a') },
      { ...request, terms: ['a'.repeat(MAX_QUERY + 1)] },
      { ...request, authors: undefined },
      { ...request, authors: ['b'] },
      { ...request, authors: [{ value: 'b' }] },
      { ...request, authors: [{ value: 1, prefix: true }] },
    ]) {
      expect(isSearchRequest(bad)).toBe(false);
    }
    expect(isSearchReply({ kind: 'results', seq: 1, ids: [1] })).toBe(false);
    expect(isSearchReply({ kind: 'results', seq: 1 })).toBe(false);
    expect(isSearchReply({ kind: 'failed' })).toBe(false);
  });
});

describe('createSearchClient', () => {
  function port() {
    const sent: SearchRequest[] = [];
    let listener: ((event: MessageEvent) => void) | undefined;
    return {
      sent,
      postMessage: (message: SearchRequest) => sent.push(message),
      addEventListener: (_type: 'message', next: (event: MessageEvent) => void) => {
        listener = next;
      },
      emit: (data: unknown) => listener?.({ data } as MessageEvent),
    };
  }

  it('sends each search and passes on answers to the latest only', () => {
    const worker = port();
    const client = createSearchClient(worker);
    const first: SearchOutcome[] = [];
    const second: SearchOutcome[] = [];
    const author = { value: 'c', prefix: false };
    client.search(ACCOUNT, { terms: ['a'], authors: [] }, (outcome) => first.push(outcome));
    client.search(ACCOUNT, { terms: ['b'], authors: [author] }, (o) => second.push(o));
    expect(worker.sent).toEqual([
      { kind: 'search', seq: 1, accountId: ACCOUNT, terms: ['a'], authors: [] },
      { kind: 'search', seq: 2, accountId: ACCOUNT, terms: ['b'], authors: [author] },
    ]);

    worker.emit({ kind: 'results', seq: 1, ids: ['1'] });
    worker.emit({ kind: 'results', seq: 2, ids: ['2', '3'] });
    worker.emit({ kind: 'failed', seq: 2 });
    worker.emit({ kind: 'nonsense', seq: 2 });
    expect(first).toEqual([]);
    expect(second).toEqual([{ state: 'done', ids: new Set(['2', '3']) }, { state: 'failed' }]);
  });

  it('stops passing on answers once cancelled', () => {
    const worker = port();
    const outcomes: SearchOutcome[] = [];
    const cancel = createSearchClient(worker).search(ACCOUNT, { terms: ['a'], authors: [] }, (o) =>
      outcomes.push(o),
    );
    cancel();
    worker.emit({ kind: 'results', seq: 1, ids: ['1'] });
    expect(outcomes).toEqual([]);
  });
});

describe('the search service', () => {
  let db: LibraryDatabase;
  let databases = 0;
  let clock = 1000;
  let service: SearchService | undefined;
  let replies: SearchReply[];
  let watchers: Array<{ rerun: () => Promise<void>; stopped: boolean }>;

  beforeEach(() => {
    db = new LibraryDatabase(`search-test-${++databases}`);
    clock = 1000;
    replies = [];
    watchers = [];
  });

  afterEach(() => service?.stop());

  /** Stands in for liveQuery: runs the query now, and again on `changed()`. */
  function start(pageSize = 2) {
    service = createSearchService({
      db,
      watch: (query, next, error) => {
        const watcher = {
          stopped: false,
          rerun: () => query().then((value) => void (!watcher.stopped && next(value)), error),
        };
        watchers.push(watcher);
        void watcher.rerun();
        return () => {
          watcher.stopped = true;
        };
      },
      reply: (message) => replies.push(message),
      now: () => clock,
      pageSize,
    });
    return service;
  }

  const changed = () => Promise.all(watchers.map((watcher) => watcher.rerun()));

  /** Waits for the service to have replied `count` times in all. */
  async function replied(count: number) {
    for (let tries = 0; replies.length < count && tries < 100; tries += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(replies).toHaveLength(count);
    return replies[count - 1]!;
  }

  const search = (seq: number, terms: string[], accountId = ACCOUNT) =>
    service!.receive({ kind: 'search', seq, accountId, terms, authors: [] });

  const store = (
    posts: Array<[id: string, options?: Partial<RawPostOptions>]>,
    accountId = ACCOUNT,
  ) =>
    saveCapture(
      db,
      {
        accountId,
        source: 'bookmark',
        items: posts.map(([id, options], index) => ({
          post: normalisePost(rawPost({ id, ...options }))!,
          sortIndex: String(9000 - index),
        })),
        referenced: [],
        unavailable: [],
      },
      (clock += 10),
    );

  it('reads the library a page at a time, then answers', async () => {
    await store([
      ['1', { text: 'Café talk' }],
      ['2', { text: 'Rust' }],
      ['3', { text: 'More rust', handle: 'rustacean' }],
      ['4', { text: 'Other' }],
      ['5', { text: 'Last', name: 'Rusty Name' }],
    ]);
    start(2);
    search(1, ['rust']);
    expect(await replied(1)).toEqual({ kind: 'results', seq: 1, ids: ['2', '3', '5'] });
    search(2, ['cafe']);
    expect(await replied(2)).toEqual({ kind: 'results', seq: 2, ids: ['1'] });
  });

  it('answers again when posts are stored, changed or removed, and not otherwise', async () => {
    await store([
      ['1', { text: 'rust' }],
      ['2', { text: 'go' }],
    ]);
    start();
    search(1, ['rust']);
    expect(await replied(1)).toMatchObject({ ids: ['1'] });

    await store([['3', { text: 'rust too' }]]);
    await changed();
    expect(await replied(2)).toMatchObject({ seq: 1, ids: ['1', '3'] });

    await store([['2', { text: 'now rust' }]]);
    await changed();
    expect(await replied(3)).toMatchObject({ ids: ['1', '2', '3'] });

    await setPostTags(db, { accountId: ACCOUNT, postId: '1', add: ['a'], remove: [] });
    await changed();
    expect(replies).toHaveLength(3);

    await db.posts.delete([ACCOUNT, '3']);
    await changed();
    expect(await replied(4)).toMatchObject({ ids: ['1', '2'] });
  });

  it('picks up posts stored while it was reading', async () => {
    await store([['1', { text: 'rust' }]]);
    start();
    search(1, ['rust']);
    await store([['2', { text: 'rust' }]]);
    await replied(1);
    await changed();
    const last = replies[replies.length - 1]!;
    expect(last).toMatchObject({ ids: ['1', '2'] });
  });

  it('reads another account afresh, and keeps accounts apart', async () => {
    await store([['1', { text: 'rust' }]]);
    await store([['2', { text: 'rust' }]], OTHER);
    start();
    search(1, ['rust']);
    expect(await replied(1)).toMatchObject({ ids: ['1'] });
    search(2, ['rust'], OTHER);
    expect(await replied(2)).toMatchObject({ seq: 2, ids: ['2'] });
    expect(watchers.map((watcher) => watcher.stopped)).toEqual([true, false]);
  });

  it('ignores anything but a search request', async () => {
    start();
    service!.receive({ kind: 'search', seq: 1, accountId: ACCOUNT, terms: 'rust', authors: [] });
    service!.receive('rust');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(replies).toEqual([]);
  });

  it('says so when the library cannot be read', async () => {
    db.close({ disableAutoOpen: true });
    start();
    search(1, ['rust']);
    expect(await replied(1)).toEqual({ kind: 'failed', seq: 1 });
  });
});

describe('reading posts for search', () => {
  let db: LibraryDatabase;
  let databases = 0;

  beforeEach(() => {
    db = new LibraryDatabase(`search-read-test-${++databases}`);
  });

  const store = (ids: string[], now: number, accountId = ACCOUNT) =>
    saveCapture(
      db,
      {
        accountId,
        items: ids.map((id) => ({ post: normalisePost(rawPost({ id }))! })),
        referenced: [],
        unavailable: [],
      },
      now,
    );

  it('reads pages in ID order, for one account', async () => {
    await store(['3', '1', '2'], 100);
    await store(['0'], 100, OTHER);
    const ids = async (after: string, limit: number) =>
      (await postsAfter(db, ACCOUNT, after, limit)).map((post) => post.id);
    expect(await ids('', 2)).toEqual(['1', '2']);
    expect(await ids('2', 2)).toEqual(['3']);
    expect(await ids('3', 2)).toEqual([]);
  });

  it('lists every ID, and the posts stored since a time', async () => {
    await store(['1', '2'], 100);
    await store(['2', '3'], 200);
    await store(['9'], 300, OTHER);
    const changes = await postChanges(db, ACCOUNT, 200);
    expect(changes.ids).toEqual(['1', '2', '3']);
    expect(changes.changed.map((post) => post.id).sort()).toEqual(['2', '3']);
  });

  it('adds the index on stored time to a library made before it', async () => {
    const name = `search-upgrade-test-${++databases}`;
    // Version 1 as published.
    const old = new Dexie(name);
    old.version(1).stores({
      posts:
        '[accountId+id], [accountId+isBookmark+bookmarkSort], [accountId+isLike+likeSort], [accountId+hasTags+savedAt], [accountId+savedAt], [accountId+author.handle]',
      tags: '[accountId+id], &[accountId+nameKey], [accountId+lastUsedAt]',
      postTags: '[accountId+postId+tagId], [accountId+tagId+taggedAt], [accountId+postId]',
      meta: '[accountId+key]',
    });
    await old.table('posts').put({ accountId: ACCOUNT, id: '1', lastSeenAt: 500 });
    old.close();

    const upgraded = new LibraryDatabase(name);
    expect(upgraded.verno).toBe(2);
    expect((await postChanges(upgraded, ACCOUNT, 400)).changed.map((post) => post.id)).toEqual([
      '1',
    ]);
    upgraded.close();
  });
});

describe('library shortcuts', () => {
  const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { tagName: 'BODY' },
    ...extra,
  });

  it('focuses search on `/` alone, outside a field', () => {
    expect(isSearchShortcut(press('/'))).toBe(true);
    expect(isSearchShortcut(press('/', { target: null }))).toBe(true);
    expect(isSearchShortcut(press('?'))).toBe(false);
    expect(isSearchShortcut(press('/', { ctrlKey: true }))).toBe(false);
    expect(isSearchShortcut(press('/', { metaKey: true }))).toBe(false);
    expect(isSearchShortcut(press('/', { altKey: true }))).toBe(false);
    expect(isSearchShortcut(press('/', { target: { tagName: 'INPUT' } }))).toBe(false);
  });

  it('treats inputs, text areas, selects and editable content as fields', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isTyping({ tagName })).toBe(true);
    expect(isTyping({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTyping({ tagName: 'BUTTON' })).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe('summaryOf', () => {
  it('counts posts, or says how the search is going', () => {
    expect(summaryOf({ state: 'none' }, 1)).toBe('1 post');
    expect(summaryOf({ state: 'done', ids: new Set() }, 3)).toBe('3 posts');
    expect(summaryOf({ state: 'pending' }, 3)).toBe(SEARCHING);
    expect(summaryOf({ state: 'failed' }, 3)).toBe(SEARCH_FAILED);
  });
});
