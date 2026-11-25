import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalisePost, type CapturedMedia } from '@/src/capture/normalise';
import { saveCapture, updateSettings } from '@/src/db/repo';
import { LibraryDatabase } from '@/src/db/schema';
import { formatDate, initialOf, plural } from '@/src/library/format';
import { EMPTY_SNAPSHOT, isEmpty, loadSnapshot } from '@/src/library/snapshot';
import { MAX_THUMBNAILS, thumbnailsOf } from '@/src/library/thumbnails';
import { rawPost } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';

describe('format', () => {
  it('pluralises counts', () => {
    expect(plural(0, 'like')).toBe('0 likes');
    expect(plural(1, 'like')).toBe('1 like');
    expect(plural(1234, 'bookmark')).toBe(`${(1234).toLocaleString()} bookmarks`);
  });

  it('writes dates in the reader’s locale', () => {
    const time = Date.UTC(2024, 2, 1, 12);
    expect(formatDate(time)).toBe(
      new Date(time).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    );
  });

  it.each([
    ['Example User', 'E'],
    ['  lower', 'L'],
    ['😀 Smile', '😀'],
    ['', '?'],
    ['   ', '?'],
  ])('takes the initial of %j', (name, initial) => {
    expect(initialOf(name)).toBe(initial);
  });
});

describe('thumbnailsOf', () => {
  const photo = (n: number): CapturedMedia => ({
    kind: 'photo',
    url: `https://pbs.twimg.com/media/p${n}.jpg`,
    alt: `Alt ${n}`,
  });

  it('shows photos at the small size, and videos and gifs by their still', () => {
    expect(
      thumbnailsOf([
        photo(1),
        {
          kind: 'video',
          url: 'https://video.twimg.com/v.mp4',
          previewUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/v.jpg',
        },
        { kind: 'gif', url: 'https://video.twimg.com/g.mp4' },
      ]),
    ).toEqual([
      { src: 'https://pbs.twimg.com/media/p1.jpg?name=small', kind: 'photo', alt: 'Alt 1' },
      {
        src: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/v.jpg',
        kind: 'video',
        alt: '',
      },
    ]);
  });

  it('skips media on other hosts', () => {
    expect(thumbnailsOf([{ kind: 'photo', url: 'https://media.example/p.jpg' }])).toEqual([]);
  });

  it('shows at most as many as asked for', () => {
    const many = [1, 2, 3, 4, 5, 6].map(photo);
    expect(thumbnailsOf(many)).toHaveLength(MAX_THUMBNAILS);
    expect(thumbnailsOf(many, 2)).toHaveLength(2);
  });
});

describe('loadSnapshot', () => {
  let db: LibraryDatabase;
  let databases = 0;
  beforeEach(() => {
    db = new LibraryDatabase(`library-test-${++databases}`);
  });

  const save = (source: 'bookmark' | 'like', ids: string[], favorited = false) =>
    saveCapture(db, {
      accountId: ACCOUNT,
      source,
      items: ids.map((id, index) => ({
        post: normalisePost(rawPost({ id, favorited }))!,
        sortIndex: String(9000 - index),
      })),
      referenced: [],
      unavailable: [],
    });

  it('is empty, with the stored settings, before anything is captured', async () => {
    await updateSettings(db, { remoteImages: false });
    const snapshot = await loadSnapshot(db);
    expect(snapshot).toEqual({ ...EMPTY_SNAPSHOT, settings: { remoteImages: false } });
    expect(isEmpty(snapshot)).toBe(true);
  });

  it('holds totals, overlap and the newest posts of each source', async () => {
    await save('bookmark', ['13', '12', '11'], true);
    await save('like', ['21']);

    const snapshot = await loadSnapshot(db, 2);

    expect(snapshot.totals).toEqual({ bookmarks: 3, likes: 4 });
    expect(snapshot.inBoth).toBe(3);
    expect(snapshot.bookmarks.map((post) => post.id)).toEqual(['13', '12']);
    expect(snapshot.likes).toHaveLength(2);
    expect(snapshot.settings).toEqual({ remoteImages: true });
    expect(isEmpty(snapshot)).toBe(false);
  });
});
