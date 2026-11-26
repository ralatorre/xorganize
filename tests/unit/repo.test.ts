import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalisePost, type CapturedPost } from '@/src/capture/normalise';
import {
  activeAccount,
  clearSource,
  counts,
  mergePost,
  readSettings,
  recentKey,
  saveCapture,
  sortKey,
  sourceIds,
  unknownKey,
  updateSettings,
  type CaptureBatch,
} from '@/src/db/repo';
import { LibraryDatabase } from '@/src/db/schema';
import { rawPost, type RawPostOptions } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';

const post = (id: string, options: Partial<RawPostOptions> = {}): CapturedPost =>
  normalisePost(rawPost({ id, ...options }))!;

const batch = (overrides: Partial<CaptureBatch>): CaptureBatch => ({
  accountId: ACCOUNT,
  items: [],
  referenced: [],
  unavailable: [],
  ...overrides,
});

let db: LibraryDatabase;
let databases = 0;

beforeEach(() => {
  db = new LibraryDatabase(`test-${++databases}`);
});

const stored = (id: string, accountId = ACCOUNT) => db.posts.get([accountId, id]);

describe('sort keys', () => {
  it('put unknown positions lowest, real ones in numeric order, and recent changes highest', () => {
    const keys = [
      unknownKey(null),
      unknownKey(1000),
      unknownKey(Date.UTC(2030, 0, 1)),
      sortKey('9'),
      sortKey('10'),
      sortKey('1800000000000000000'),
      recentKey(1000),
      recentKey(2000),
    ];

    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys.map((key) => key.length))).toEqual(new Set([30]));
  });
});

describe('mergePost', () => {
  const context = { accountId: ACCOUNT, now: 5000 };

  it('creates a record with no source from a bare capture', () => {
    const record = mergePost(undefined, post('1'), context);

    expect(record).toMatchObject({
      accountId: ACCOUNT,
      id: '1',
      isBookmark: 0,
      isLike: 0,
      hasTags: 0,
      partial: false,
      unavailable: false,
      firstSeenAt: 5000,
      lastSeenAt: 5000,
      savedAt: 5000,
    });
    expect(record).not.toHaveProperty('bookmarkSort');
    expect(record).not.toHaveProperty('bookmarked');
    expect(record).not.toHaveProperty('liked');
  });

  it('sets the source it arrived through, with its position', () => {
    const record = mergePost(undefined, post('1'), {
      ...context,
      source: 'bookmark',
      sortIndex: '77',
    });

    expect(record.isBookmark).toBe(1);
    expect(record.bookmarkSort).toBe(sortKey('77'));
    expect(record.isLike).toBe(0);
  });

  it('follows the account’s own state for the other source', () => {
    const likedToo = mergePost(undefined, post('1', { favorited: true }), {
      ...context,
      source: 'bookmark',
      sortIndex: '77',
    });
    expect(likedToo.isLike).toBe(1);
    // When it was liked is not known, so it sorts below real positions, by the post's date.
    expect(likedToo.likeSort).toBe(unknownKey(Date.UTC(2024, 0, 1, 12)));

    const noLongerLiked = mergePost(likedToo, post('1', { favorited: false }), {
      ...context,
      now: 6000,
      source: 'bookmark',
      sortIndex: '77',
    });
    expect(noLongerLiked.isLike).toBe(0);
    expect(noLongerLiked).not.toHaveProperty('likeSort');
  });

  it('lets the source win over a stale flag in the same response', () => {
    const record = mergePost(undefined, post('1', { bookmarked: false }), {
      ...context,
      source: 'bookmark',
    });

    expect(record.isBookmark).toBe(1);
  });

  it('keeps a real position when the post is seen again without one', () => {
    const first = mergePost(undefined, post('1'), { ...context, source: 'like', sortIndex: '42' });
    const again = mergePost(first, post('1', { favorited: true }), { ...context, now: 9000 });

    expect(again.likeSort).toBe(sortKey('42'));
  });

  it('replaces a provisional position with the real one', () => {
    const justLiked = mergePost(undefined, post('1'), { ...context, source: 'like' });
    const fromTimeline = mergePost(justLiked, post('1'), {
      ...context,
      now: 9000,
      source: 'like',
      sortIndex: '42',
    });

    expect(justLiked.likeSort).toBe(recentKey(5000));
    expect(fromTimeline.likeSort).toBe(sortKey('42'));
  });

  it('updates content but never moves first sight or save time forward, and keeps tags', () => {
    const first = {
      ...mergePost(undefined, post('1', { text: 'old' }), context),
      hasTags: 1 as const,
    };
    const second = mergePost(first, post('1', { text: 'edited' }), { ...context, now: 9000 });

    expect(second).toMatchObject({
      text: 'edited',
      firstSeenAt: 5000,
      savedAt: 5000,
      lastSeenAt: 9000,
      hasTags: 1,
    });
  });
});

describe('saveCapture', () => {
  it('stores a timeline’s posts and returns the totals', async () => {
    const totals = await saveCapture(
      db,
      batch({
        source: 'bookmark',
        items: [
          { post: post('3'), sortIndex: '9003' },
          { post: post('2', { favorited: true }), sortIndex: '9002' },
          { post: post('1'), sortIndex: '9001' },
        ],
      }),
    );

    expect(totals).toEqual({ bookmarks: 3, likes: 1 });
    expect(await stored('2')).toMatchObject({ isBookmark: 1, isLike: 1 });
  });

  it('is idempotent', async () => {
    const capture = batch({ source: 'like', items: [{ post: post('1'), sortIndex: '9001' }] });

    await saveCapture(db, capture, 1000);
    const totals = await saveCapture(db, capture, 2000);

    expect(totals).toEqual({ bookmarks: 0, likes: 1 });
    expect(await db.posts.count()).toBe(1);
    expect(await stored('1')).toMatchObject({ savedAt: 1000, lastSeenAt: 2000 });
  });

  it('keeps referenced posts without counting them as a source', async () => {
    const quoted = post('9');
    const totals = await saveCapture(
      db,
      batch({
        source: 'bookmark',
        items: [{ post: post('1', { quoted: rawPost({ id: '9' }) }), sortIndex: '9001' }],
        referenced: [quoted],
      }),
    );

    expect(totals).toEqual({ bookmarks: 1, likes: 0 });
    expect(await stored('9')).toMatchObject({ isBookmark: 0, isLike: 0 });
    expect((await stored('1'))?.quotedId).toBe('9');
  });

  it('gives a post that is both referenced and an item the item’s source', async () => {
    await saveCapture(
      db,
      batch({
        source: 'bookmark',
        items: [{ post: post('1'), sortIndex: '9001' }],
        referenced: [post('1')],
      }),
    );

    expect((await stored('1'))?.isBookmark).toBe(1);
  });

  it('marks stored posts that X reports unavailable, and ignores unknown ones', async () => {
    await saveCapture(
      db,
      batch({ source: 'bookmark', items: [{ post: post('1'), sortIndex: '1' }] }),
    );
    await saveCapture(db, batch({ source: 'bookmark', unavailable: ['1', '404'] }));

    expect(await stored('1')).toMatchObject({
      unavailable: true,
      isBookmark: 1,
      text: post('1').text,
    });
    expect(await stored('404')).toBeUndefined();
  });

  it('keeps accounts apart', async () => {
    await saveCapture(
      db,
      batch({ source: 'bookmark', items: [{ post: post('1'), sortIndex: '1' }] }),
    );
    await saveCapture(
      db,
      batch({ accountId: OTHER, source: 'like', items: [{ post: post('1'), sortIndex: '1' }] }),
    );

    expect(await counts(db, ACCOUNT)).toEqual({ bookmarks: 1, likes: 0 });
    expect(await counts(db, OTHER)).toEqual({ bookmarks: 0, likes: 1 });
    expect(await stored('1', ACCOUNT)).toMatchObject({ isBookmark: 1, isLike: 0 });
    expect(await activeAccount(db)).toBe(OTHER);
  });

  it('stores a post the user has just bookmarked, ahead of the rest', async () => {
    await saveCapture(
      db,
      batch({
        source: 'bookmark',
        items: [
          { post: post('2'), sortIndex: '9002' },
          { post: post('1'), sortIndex: '9001' },
        ],
      }),
    );
    await saveCapture(db, batch({ source: 'bookmark', items: [{ post: post('7') }] }));

    expect(await sourceIds(db, ACCOUNT, 'bookmark')).toEqual(['7', '2', '1']);
  });
});

describe('sourceIds', () => {
  it('returns one source in timeline order', async () => {
    await saveCapture(
      db,
      batch({
        source: 'like',
        items: [
          { post: post('11'), sortIndex: '100' },
          { post: post('12'), sortIndex: '20' },
          { post: post('13'), sortIndex: '3' },
        ],
      }),
    );
    await saveCapture(
      db,
      batch({ source: 'bookmark', items: [{ post: post('99'), sortIndex: '1' }] }),
    );

    expect(await sourceIds(db, ACCOUNT, 'like')).toEqual(['11', '12', '13']);
    expect(await sourceIds(db, ACCOUNT, 'bookmark')).toEqual(['99']);
    expect(await sourceIds(db, OTHER, 'like')).toEqual([]);
  });
});

describe('clearSource', () => {
  it('removes a post that is left with no source and no tags', async () => {
    await saveCapture(
      db,
      batch({ source: 'bookmark', items: [{ post: post('1'), sortIndex: '1' }] }),
    );

    const totals = await clearSource(db, ACCOUNT, '1', 'bookmark');

    expect(totals).toEqual({ bookmarks: 0, likes: 0 });
    expect(await stored('1')).toBeUndefined();
  });

  it('keeps a post that still has another source', async () => {
    await saveCapture(
      db,
      batch({
        source: 'bookmark',
        items: [{ post: post('1', { favorited: true }), sortIndex: '1' }],
      }),
    );

    const totals = await clearSource(db, ACCOUNT, '1', 'bookmark');

    expect(totals).toEqual({ bookmarks: 0, likes: 1 });
    const kept = await stored('1');
    expect(kept).toMatchObject({ isBookmark: 0, isLike: 1 });
    expect(kept).not.toHaveProperty('bookmarkSort');
  });

  it('keeps a tagged post', async () => {
    await saveCapture(db, batch({ source: 'like', items: [{ post: post('1'), sortIndex: '1' }] }));
    await db.posts.update([ACCOUNT, '1'], { hasTags: 1 });

    await clearSource(db, ACCOUNT, '1', 'like');

    expect(await stored('1')).toMatchObject({ isLike: 0, hasTags: 1 });
  });

  it('does nothing for a post it has never seen', async () => {
    expect(await clearSource(db, ACCOUNT, '404', 'like')).toEqual({ bookmarks: 0, likes: 0 });
  });
});

describe('activeAccount', () => {
  it('is undefined until something is captured', async () => {
    expect(await activeAccount(db)).toBeUndefined();
  });
});

describe('a post read from the page', () => {
  const context = { accountId: ACCOUNT, now: 5000 };
  const fromPage: CapturedPost = {
    id: '1',
    url: 'https://x.com/example_user/status/1',
    text: 'Text as shown on the page',
    createdAt: null,
    author: { handle: 'example_user', name: 'Example User' },
    media: [],
    links: [],
    sensitive: false,
  };

  it('is stored as partial when nothing better is known', () => {
    const record = mergePost(undefined, fromPage, { ...context, source: 'like', partial: true });

    expect(record).toMatchObject({ partial: true, isLike: 1, text: 'Text as shown on the page' });
    expect(record.likeSort).toBe(recentKey(5000));
  });

  it('never replaces the content of a full capture, but still sets the source', () => {
    const full = mergePost(undefined, post('1', { text: 'Full text', media: [] }), context);
    const merged = mergePost(full, fromPage, {
      ...context,
      now: 9000,
      source: 'like',
      partial: true,
    });

    expect(merged).toMatchObject({
      partial: false,
      text: 'Full text',
      createdAt: full.createdAt,
      author: full.author,
      isLike: 1,
      lastSeenAt: 9000,
    });
  });

  it('is completed by the next full capture', () => {
    const partial = mergePost(undefined, fromPage, { ...context, source: 'like', partial: true });
    const completed = mergePost(partial, post('1', { text: 'Full text' }), {
      ...context,
      now: 9000,
      source: 'like',
      sortIndex: '42',
    });

    expect(completed).toMatchObject({
      partial: false,
      text: 'Full text',
      isLike: 1,
      savedAt: 5000,
    });
    expect(completed.likeSort).toBe(sortKey('42'));
  });

  it('is replaced by a later partial capture of the same post', () => {
    const first = mergePost(undefined, fromPage, { ...context, source: 'like', partial: true });
    const second = mergePost(
      first,
      { ...fromPage, text: 'Edited' },
      { ...context, source: 'bookmark', partial: true },
    );

    expect(second).toMatchObject({ partial: true, text: 'Edited', isLike: 1, isBookmark: 1 });
  });
});

describe('the order of a source', () => {
  it('is recent changes, then timeline positions, then posts known only by the API’s say-so', async () => {
    await saveCapture(
      db,
      batch({
        source: 'bookmark',
        items: [
          {
            post: post('31', { favorited: true, createdAt: 'Mon Jan 01 12:00:00 +0000 2024' }),
            sortIndex: '3',
          },
          {
            post: post('32', { favorited: true, createdAt: 'Wed Jan 01 12:00:00 +0000 2025' }),
            sortIndex: '2',
          },
        ],
      }),
    );
    await saveCapture(
      db,
      batch({
        source: 'like',
        items: [
          { post: post('21'), sortIndex: '200' },
          { post: post('22'), sortIndex: '100' },
        ],
      }),
    );
    await saveCapture(db, batch({ source: 'like', items: [{ post: post('11') }] }));

    expect(await sourceIds(db, ACCOUNT, 'like')).toEqual(['11', '21', '22', '32', '31']);
  });
});

describe('settings', () => {
  it('show images from X unless turned off', async () => {
    expect(await readSettings(db)).toEqual({ remoteImages: true, backupReminderDays: 30 });
    expect(await updateSettings(db, { remoteImages: false })).toEqual({
      remoteImages: false,
      backupReminderDays: 30,
    });
    expect(await readSettings(db)).toEqual({ remoteImages: false, backupReminderDays: 30 });
  });

  it('remind of backups every 30 days unless set to one of the other choices', async () => {
    for (const days of [7, 90, 0, 30]) {
      expect(await updateSettings(db, { backupReminderDays: days })).toMatchObject({
        backupReminderDays: days,
      });
      expect((await readSettings(db)).backupReminderDays).toBe(days);
    }
    await db.meta.put({ accountId: '', key: 'settings', value: { backupReminderDays: 12 } });
    expect((await readSettings(db)).backupReminderDays).toBe(30);
  });

  it('fall back to defaults for values of the wrong type', async () => {
    await db.meta.put({
      accountId: '',
      key: 'settings',
      value: { remoteImages: 'no', backupReminderDays: '7' },
    });
    expect(await readSettings(db)).toEqual({ remoteImages: true, backupReminderDays: 30 });
    await db.meta.put({ accountId: '', key: 'settings', value: 'garbage' });
    expect(await readSettings(db)).toEqual({ remoteImages: true, backupReminderDays: 30 });
  });
});
