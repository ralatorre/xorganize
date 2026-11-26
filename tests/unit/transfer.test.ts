import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LibraryDatabase } from '@/src/db/schema';
import type { PostTag, StoredPost, Tag, TagSuggestion } from '@/src/db/types';
import { exportStatus, viewScope } from '@/src/library/view-export';
import { CSV_COLUMNS, csvCell, csvParts, csvRow } from '@/src/transfer/csv';
import { exportPosts } from '@/src/transfer/export';
import { MAX_NAME_IN_FILE, exportFilename, fileSafe } from '@/src/transfer/filename';
import { exportedPost } from '@/src/transfer/format';
import { jsonParts } from '@/src/transfer/json';
import { readExport } from '@/src/transfer/read';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';
const DAY = Date.UTC(2026, 0, 2, 3, 4, 5);

function post(id: string, changes: Partial<StoredPost> = {}): StoredPost {
  return {
    accountId: ACCOUNT,
    id,
    url: `https://x.com/example_user/status/${id}`,
    text: `Post ${id}`,
    createdAt: DAY,
    author: { handle: 'example_user', name: 'Example User' },
    media: [],
    links: [],
    sensitive: false,
    isBookmark: 1,
    isLike: 0,
    hasTags: 0,
    bookmarkSort: `sort-${id}`,
    partial: false,
    unavailable: false,
    firstSeenAt: DAY,
    lastSeenAt: DAY,
    savedAt: DAY + Number(id),
    ...changes,
  };
}

const tag = (id: string, name: string, accountId = ACCOUNT): Tag => ({
  accountId,
  id,
  name,
  nameKey: name.toLowerCase(),
  color: 1,
  createdAt: DAY,
  lastUsedAt: DAY,
});

const link = (postId: string, tagId: string, taggedAt: number, accountId = ACCOUNT): PostTag => ({
  accountId,
  postId,
  tagId,
  taggedAt,
});

let db: LibraryDatabase;
let databases = 0;

beforeEach(async () => {
  db = new LibraryDatabase(`transfer-test-${++databases}`);
  await db.posts.bulkPut([
    post('1', { quotedId: '9' }),
    post('2', { isBookmark: 0, isLike: 1, bookmarkSort: undefined, likeSort: 's', hasTags: 1 }),
    post('3', { isBookmark: 0, bookmarkSort: undefined, hasTags: 1 }), // tagged only
    post('9', { isBookmark: 0, bookmarkSort: undefined }), // quoted by 1, not in the library
    post('8', { isBookmark: 0, bookmarkSort: undefined }), // quoted by nothing
    post('1', { accountId: OTHER, text: 'Not this account' }),
  ]);
  await db.tags.bulkPut([
    tag('t-rust', 'rust'),
    tag('t-go', 'go'),
    tag('t-unused', 'unused'),
    tag('t-else', 'else', OTHER),
  ]);
  await db.postTags.bulkPut([
    link('2', 't-go', 20),
    link('2', 't-rust', 10),
    link('3', 't-rust', 30),
    link('1', 't-else', 1, OTHER),
  ]);
});

const ids = (posts: readonly StoredPost[]) => posts.map((stored) => stored.id);

describe('readExport', () => {
  it('reads the whole library, newest first, with every tag and the posts it quotes', async () => {
    const data = await readExport(db, ACCOUNT, 'library');
    expect(ids(data.posts)).toEqual(['3', '2', '1']);
    expect(ids(data.quoted)).toEqual(['9']);
    expect(data.tags.map((stored) => stored.id).sort()).toEqual(['t-go', 't-rust', 't-unused']);
    expect(data.postTags).toHaveLength(3);
  });

  it('reads the given posts in their order, with only the tags they carry', async () => {
    const data = await readExport(db, ACCOUNT, { postIds: ['2', '1', '2', '404'] });
    expect(ids(data.posts)).toEqual(['2', '1']);
    expect(ids(data.quoted)).toEqual(['9']);
    expect(data.tags.map((stored) => stored.id).sort()).toEqual(['t-go', 't-rust']);
    expect(data.postTags.map((stored) => stored.postId)).toEqual(['2', '2']);
  });

  it('does not repeat a quoted post that is exported itself', async () => {
    await db.posts.put(post('4', { quotedId: '1' }));
    const data = await readExport(db, ACCOUNT, { postIds: ['4', '1'] });
    expect(ids(data.quoted)).toEqual(['9']);
  });

  it('reads an empty view as nothing', async () => {
    const data = await readExport(db, ACCOUNT, { postIds: [] });
    expect(data).toEqual({ posts: [], quoted: [], tags: [], postTags: [] });
  });
});

describe('jsonParts', () => {
  const header = {
    format: 'xorganize' as const,
    version: 1 as const,
    exportedAt: '2026-01-02T03:04:05.000Z',
    accountId: ACCOUNT,
  };

  it('joins into one JSON document that holds the header and every record', async () => {
    const data = await readExport(db, ACCOUNT, 'library');
    const file = JSON.parse(jsonParts(header, data).join(''));
    expect(file).toMatchObject(header);
    expect(file.tags).toHaveLength(3);
    expect(file.tags[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      color: 1,
      createdAt: DAY,
      lastUsedAt: DAY,
    });
    expect(file.posts.map((exported: { id: string }) => exported.id)).toEqual(['3', '2', '1', '9']);
    expect(file.postTags).toContainEqual({ postId: '2', tagId: 't-go', taggedAt: 20 });
  });

  it('writes empty lists as valid JSON', () => {
    const file = JSON.parse(
      jsonParts(header, { posts: [], quoted: [], tags: [], postTags: [] }).join(''),
    );
    expect(file).toEqual({ ...header, tags: [], posts: [], postTags: [] });
  });

  it('keeps everything stored about a post but its account and tag flag', () => {
    const exported = exportedPost(post('1', { hasTags: 1, quotedId: '9' }));
    expect(exported).not.toHaveProperty('accountId');
    expect(exported).not.toHaveProperty('hasTags');
    expect(exported).toMatchObject({
      id: '1',
      bookmarkSort: 'sort-1',
      quotedId: '9',
      savedAt: DAY + 1,
    });
  });
});

describe('csvCell', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@handle', '\tx', '\rx'])(
    'neutralises %j, which a spreadsheet would run',
    (value) => {
      expect(csvCell(value).replace(/^"/, '').startsWith(`'`)).toBe(true);
    },
  );

  it('quotes a cell with a comma, quote or line break, doubling quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('quotes a cell when asked, even with nothing that needs it', () => {
    expect(csvCell('2125755045182670001', true)).toBe('"2125755045182670001"');
    expect(csvCell('say "hi"', true)).toBe('"say ""hi"""');
  });

  it('leaves a plain cell alone', () => {
    expect(csvCell('plain text')).toBe('plain text');
    expect(csvCell('')).toBe('');
  });
});

describe('csvRow', () => {
  const cells = (row: string) => row.replace(/\r\n$/, '').split(',');

  it('writes each column, in order', () => {
    const row = csvRow(
      post('1', {
        isLike: 1,
        media: [
          { kind: 'photo', url: 'https://pbs.twimg.com/media/a.jpg' },
          { kind: 'photo', url: 'https://pbs.twimg.com/media/b.jpg' },
        ],
      }),
      ['rust', 'go'],
    );
    expect(row.endsWith('\r\n')).toBe(true);
    expect(cells(row)).toEqual([
      '"1"', // identifiers are quoted, so that spreadsheets can keep them as text
      'https://x.com/example_user/status/1',
      '"example_user"',
      'Example User',
      '2026-01-02T03:04:05.000Z',
      new Date(DAY + 1).toISOString(),
      'bookmark;like',
      'rust;go',
      'Post 1',
      'https://pbs.twimg.com/media/a.jpg https://pbs.twimg.com/media/b.jpg',
    ]);
    expect(cells(row)).toHaveLength(CSV_COLUMNS.length);
  });

  it('leaves the date and sources empty when unknown or only tagged', () => {
    const row = cells(csvRow(post('3', { createdAt: null, isBookmark: 0 }), []));
    expect(row[4]).toBe('');
    expect(row[6]).toBe('');
    expect(row[7]).toBe('');
  });
});

describe('csvParts', () => {
  it('starts with a byte order mark and the header, then a row per post, tags in the order applied', async () => {
    const data = await readExport(db, ACCOUNT, 'library');
    const parts = csvParts(data);
    expect(parts[0]).toBe(`\uFEFF${CSV_COLUMNS.join(',')}\r\n`);
    expect(parts).toHaveLength(4); // the quoted post gets no row
    expect(parts[2]).toContain(',rust;go,');
  });
});

describe('exportFilename', () => {
  const day = new Date(2026, 0, 2, 23, 30);

  it('names the file with the local date', () => {
    expect(exportFilename('json', day)).toBe('xorganize-export-2026-01-02.json');
    expect(exportFilename('csv', day)).toBe('xorganize-export-2026-01-02.csv');
  });

  it('adds a tag name', () => {
    expect(exportFilename('csv', day, 'Recipes')).toBe('xorganize-export-recipes-2026-01-02.csv');
  });

  it('leaves out a tag name with nothing usable in it', () => {
    expect(exportFilename('json', day, '🦀')).toBe('xorganize-export-2026-01-02.json');
  });
});

describe('fileSafe', () => {
  it('turns every run of other characters, slashes included, into one dash', () => {
    expect(fileSafe('dev/rust')).toBe('dev-rust');
    expect(fileSafe('  to read: later?  ')).toBe('to-read-later');
  });

  it('keeps letters and digits in any script', () => {
    expect(fileSafe('café 2')).toBe('café-2');
    expect(fileSafe('東京')).toBe('東京');
  });

  it(`keeps at most ${MAX_NAME_IN_FILE} characters, with no dash at the end`, () => {
    expect(fileSafe('a'.repeat(MAX_NAME_IN_FILE - 1) + '-b')).toBe(
      'a'.repeat(MAX_NAME_IN_FILE - 1),
    );
    expect(Array.from(fileSafe('é'.repeat(80)))).toHaveLength(MAX_NAME_IN_FILE);
  });
});

describe('exportPosts', () => {
  const now = new Date(2026, 0, 2, 12);
  const parsed = (parts: string[]) => JSON.parse(parts.join(''));

  it('exports the library as a full JSON backup', async () => {
    const file = await exportPosts(db, ACCOUNT, 'library', 'json', now);
    expect(file).toMatchObject({
      name: 'xorganize-export-2026-01-02.json',
      type: 'application/json',
      count: 3,
    });
    const json = parsed(file.parts);
    expect(json).toMatchObject({ format: 'xorganize', version: 1, accountId: ACCOUNT });
    expect(json.exportedAt).toBe(now.toISOString());
    expect(json).not.toHaveProperty('scope');
  });

  it('marks a view export as partial, and names it after its one tag', async () => {
    const file = await exportPosts(db, ACCOUNT, { postIds: ['2'], tag: 'rust' }, 'json', now);
    expect(file.name).toBe('xorganize-export-rust-2026-01-02.json');
    expect(file.count).toBe(1);
    expect(parsed(file.parts).scope).toBe('partial');
  });

  it('exports CSV', async () => {
    const file = await exportPosts(db, ACCOUNT, { postIds: ['2', '3'] }, 'csv', now);
    expect(file).toMatchObject({
      name: 'xorganize-export-2026-01-02.csv',
      type: 'text/csv;charset=utf-8',
      count: 2,
    });
    expect(file.parts).toHaveLength(3);
  });
});

describe('viewScope', () => {
  const selected = (...names: string[]): TagSuggestion[] =>
    names.map((name) => ({ id: `t-${name}`, name, color: 0, count: 1 }));

  it('names the file after the tag when the view is one tag', () => {
    expect(viewScope({ ids: ['1'], selected: selected('rust') })).toEqual({
      postIds: ['1'],
      tag: 'rust',
    });
  });

  it('names no tag for none or several', () => {
    expect(viewScope({ ids: ['1'], selected: [] })).toEqual({ postIds: ['1'] });
    expect(viewScope({ ids: ['1'], selected: selected('rust', 'go') })).toEqual({ postIds: ['1'] });
  });
});

describe('exportStatus', () => {
  it('says how many posts went out, or that the export failed', () => {
    expect(exportStatus(1)).toBe('Exported 1 post');
    expect(exportStatus(2)).toBe('Exported 2 posts');
    expect(exportStatus(undefined)).toBe('Could not export. Try again.');
  });
});
