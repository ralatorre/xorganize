import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { activeAccount, sortKey, unknownKey } from '@/src/db/repo';
import { LibraryDatabase } from '@/src/db/schema';
import type { PostTag, StoredPost, Tag } from '@/src/db/types';
import { IDLE, changeImport, isBusy, type ImportFlow } from '@/src/library/import-flow';
import {
  REPLACE_WARNING,
  importStatus,
  previewLines,
  problemMessage,
} from '@/src/library/import-messages';
import { createLibraryImport } from '@/src/library/importer';
import { exportPosts } from '@/src/transfer/export';
import { exportedPost, type ExportedPost } from '@/src/transfer/format';
import {
  PartialReplaceError,
  backupSummary,
  importBackup,
  mergeImported,
  readBackup,
} from '@/src/transfer/import';
import { readExport } from '@/src/transfer/read';
import {
  DEFAULT_IMPORT_LIMITS,
  parseBackup,
  type Backup,
  type BackupProblem,
} from '@/src/transfer/validate';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';
const DAY = Date.UTC(2026, 0, 2, 3, 4, 5);
const NOW = DAY + 1_000_000;

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
    bookmarkSort: sortKey(`100${id}`),
    partial: false,
    unavailable: false,
    firstSeenAt: DAY,
    lastSeenAt: DAY,
    savedAt: DAY + Number(id),
    ...changes,
  };
}

const tag = (id: string, name: string, changes: Partial<Tag> = {}): Tag => ({
  accountId: ACCOUNT,
  id,
  name,
  nameKey: name.toLowerCase(),
  color: 1,
  createdAt: DAY,
  lastUsedAt: DAY,
  ...changes,
});

const link = (postId: string, tagId: string, taggedAt: number, accountId = ACCOUNT): PostTag => ({
  accountId,
  postId,
  tagId,
  taggedAt,
});

/** A file's text, as export writes it. */
async function exported(
  from: LibraryDatabase,
  scope: 'library' | { postIds: string[] } = 'library',
) {
  const file = await exportPosts(from, ACCOUNT, scope, 'json', new Date(DAY));
  return file.parts.join('');
}

/** A file built from parts, for checks of one field at a time. */
function file(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'xorganize',
    version: 1,
    exportedAt: new Date(DAY).toISOString(),
    accountId: ACCOUNT,
    tags: [{ id: 't-rust', name: 'rust', color: 3, createdAt: DAY, lastUsedAt: DAY }],
    posts: [
      exportedPost(post('1')),
      exportedPost(post('2', { isBookmark: 0, bookmarkSort: undefined })),
    ],
    postTags: [{ postId: '2', tagId: 't-rust', taggedAt: DAY }],
    ...changes,
  };
}

const parse = (value: unknown, limits = DEFAULT_IMPORT_LIMITS) => {
  const text = JSON.stringify(value);
  return parseBackup(text, text.length, limits);
};

function parsed(value: unknown): Backup {
  const result = parse(value);
  if (!result.ok) throw new Error(`not a backup: ${JSON.stringify(result.problem)}`);
  return result.backup;
}

const problemOf = (value: unknown) => {
  const result = parse(value);
  return result.ok ? undefined : result.problem;
};

let db: LibraryDatabase;
let databases = 0;
const fresh = () => new LibraryDatabase(`import-test-${++databases}`);

beforeEach(async () => {
  db = fresh();
  await db.posts.bulkPut([
    post('1', { quotedId: '9', hasTags: 1 }),
    post('2', {
      isBookmark: 0,
      isLike: 1,
      bookmarkSort: undefined,
      likeSort: sortKey('5'),
      hasTags: 1,
    }),
    post('3', { isBookmark: 0, bookmarkSort: undefined, hasTags: 1 }), // tagged only
    post('9', { isBookmark: 0, bookmarkSort: undefined }), // quoted by 1
    post('1', { accountId: OTHER, text: 'Not this account' }),
  ]);
  await db.tags.bulkPut([
    tag('t-rust', 'rust', { color: 4 }),
    tag('t-go', 'Go'),
    tag('t-unused', 'unused'),
    tag('t-else', 'else', { accountId: OTHER }),
  ]);
  await db.postTags.bulkPut([
    link('1', 't-rust', DAY + 1),
    link('2', 't-go', DAY + 2),
    link('2', 't-rust', DAY + 3),
    link('3', 't-rust', DAY + 4),
    link('1', 't-else', DAY, OTHER),
  ]);
});

/** Everything an account holds, with the times that import resets left out. */
async function contents(from: LibraryDatabase, accountId = ACCOUNT) {
  const data = await readExport(from, accountId, 'library');
  const strip = (post: StoredPost): Partial<StoredPost> => {
    const copy: Partial<StoredPost> = { ...post };
    delete copy.lastSeenAt;
    return copy;
  };
  return {
    posts: data.posts.map(strip),
    quoted: data.quoted.map(strip),
    tags: data.tags,
    postTags: [...data.postTags].sort((a, b) => a.taggedAt - b.taggedAt),
  };
}

describe('parseBackup', () => {
  it('accepts what export writes, unchanged', async () => {
    const text = await exported(db);
    const result = parseBackup(text, text.length);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.header).toEqual({
      format: 'xorganize',
      version: 1,
      exportedAt: new Date(DAY).toISOString(),
      accountId: ACCOUNT,
    });
    const data = await readExport(db, ACCOUNT, 'library');
    expect(result.backup.posts).toEqual([...data.posts, ...data.quoted].map(exportedPost));
    expect(result.backup.tags.map((t) => t.name).sort()).toEqual(['Go', 'rust', 'unused']);
    expect(result.backup.postTags).toHaveLength(4);
  });

  it('keeps the mark of a file that holds part of a library', async () => {
    const backup = parsed(JSON.parse(await exported(db, { postIds: ['1'] })));
    expect(backup.header.scope).toBe('partial');
  });

  it('refuses a file over the size limit without parsing it', () => {
    expect(parseBackup('not even json', 11, { ...DEFAULT_IMPORT_LIMITS, bytes: 10 })).toEqual({
      ok: false,
      problem: { kind: 'too-large' },
    });
  });

  it.each<[string, string, BackupProblem['kind']]>([
    ['not JSON', 'post_id,url\r\n', 'not-json'],
    ['another format', JSON.stringify({ ...file(), format: 'other' }), 'not-export'],
    ['not an object', '[1,2]', 'not-export'],
    ['a newer version', JSON.stringify({ ...file(), version: 2 }), 'newer-version'],
    ['an unknown older version', JSON.stringify({ ...file(), version: 0 }), 'not-export'],
    ['no account', JSON.stringify({ ...file(), accountId: 'me' }), 'not-export'],
    ['a bad date', JSON.stringify({ ...file(), exportedAt: 'yesterday' }), 'not-export'],
    ['an unknown scope', JSON.stringify({ ...file(), scope: 'some' }), 'not-export'],
    ['a missing list', JSON.stringify({ ...file(), postTags: undefined }), 'not-export'],
  ])('refuses %s', (_, text, kind) => {
    const result = parseBackup(text, text.length);
    expect(result.ok ? undefined : result.problem.kind).toBe(kind);
  });

  it('says which version a newer file has', () => {
    expect(problemOf(file({ version: 3 }))).toEqual({ kind: 'newer-version', version: 3 });
  });

  it.each(['tags', 'posts', 'postTags'] as const)('refuses more %s than the limit', (section) => {
    const limits = { ...DEFAULT_IMPORT_LIMITS, [section]: 0 };
    expect(parse(file(), limits)).toEqual({ ok: false, problem: { kind: 'too-many', section } });
  });

  const tagWith = (changes: Record<string, unknown>) =>
    file({
      tags: [{ id: 't-rust', name: 'rust', color: 3, createdAt: DAY, lastUsedAt: DAY, ...changes }],
    });

  it.each<[string, Record<string, unknown>]>([
    ['an empty name', { name: '  ' }],
    ['a name with a semicolon', { name: 'a;b' }],
    ['a name that is not text', { name: 7 }],
    ['an ID with other characters', { id: 't rust' }],
    ['a colour outside the palette', { color: 12 }],
    ['a colour that is not a whole number', { color: 1.5 }],
    ['a negative time', { createdAt: -1 }],
    ['a time that is not a number', { lastUsedAt: '0' }],
  ])('refuses a tag with %s', (_, changes) => {
    expect(problemOf(tagWith(changes))).toEqual({ kind: 'invalid', section: 'tags', position: 1 });
  });

  it('stores a tag name as it would be typed, cleaned up', () => {
    expect(parsed(tagWith({ name: '  to   read ' })).tags[0]?.name).toBe('to read');
  });

  it('refuses two tags with one ID, or one name in two casings', () => {
    const rust = { id: 't-rust', name: 'rust', color: 3, createdAt: DAY, lastUsedAt: DAY };
    expect(problemOf(file({ tags: [rust, { ...rust, name: 'go' }], postTags: [] }))).toEqual({
      kind: 'duplicate',
      section: 'tags',
      position: 2,
    });
    expect(problemOf(file({ tags: [rust, { ...rust, id: 't-2', name: 'RUST' }] }))).toEqual({
      kind: 'duplicate',
      section: 'tags',
      position: 2,
    });
  });

  const postWith = (changes: Record<string, unknown>) =>
    file({ posts: [{ ...exportedPost(post('1')), ...changes }], postTags: [] });

  it.each<[string, Record<string, unknown>]>([
    ['an ID that is not a number', { id: 'abc' }],
    ['a link to another post', { url: 'https://x.com/example_user/status/2' }],
    ['a link off X', { url: 'https://example.com/example_user/status/1' }],
    ['a script link', { links: [{ url: 'javascript:alert(1)', display: 'x' }] }],
    ['media served over http', { media: [{ kind: 'photo', url: 'http://pbs.twimg.com/a.jpg' }] }],
    ['an unknown media kind', { media: [{ kind: 'audio', url: 'https://pbs.twimg.com/a.jpg' }] }],
    [
      'an avatar that is not https',
      { author: { handle: 'example_user', name: 'E', avatarUrl: 'data:,' } },
    ],
    ['a handle X would not allow', { author: { handle: 'not a handle', name: 'E' } }],
    ['text that is not text', { text: 5 }],
    ['a quoted post that is not an ID', { quotedId: 'nine' }],
    ['a source flag that is not 0 or 1', { isBookmark: true }],
    ['a bookmark without its position', { bookmarkSort: undefined }],
    ['a position in a source it is not in', { likeSort: sortKey('1') }],
    ['a position in another form', { bookmarkSort: 'sort-1' }],
    ['a partial flag that is not true or false', { partial: 0 }],
    ['a time that is not a number', { savedAt: 'today' }],
    ['a list that is not a list', { media: {} }],
    ['a media entry that is not an object', { media: ['https://pbs.twimg.com/a.jpg'] }],
  ])('refuses a post with %s', (_, changes) => {
    expect(problemOf(postWith(changes))).toEqual({
      kind: 'invalid',
      section: 'posts',
      position: 1,
    });
  });

  it('accepts every kind of position a source can have', () => {
    for (const key of [sortKey('17'), unknownKey(DAY), `~${'0'.repeat(29)}`]) {
      expect(parse(postWith({ bookmarkSort: key })).ok).toBe(true);
    }
  });

  it('keeps only the fields it knows, at every level', () => {
    const backup = parsed(
      postWith({
        extra: 'dropped',
        author: { handle: 'example_user', name: 'E', extra: 'dropped' },
        media: [{ kind: 'photo', url: 'https://pbs.twimg.com/a.jpg', extra: 'dropped' }],
        links: [{ url: 'https://example.com/', display: 'example.com', extra: 'dropped' }],
      }),
    );
    expect(JSON.stringify(backup)).not.toContain('dropped');
    expect(backup.posts[0]).toEqual({
      ...exportedPost(post('1')),
      author: { handle: 'example_user', name: 'E' },
      media: [{ kind: 'photo', url: 'https://pbs.twimg.com/a.jpg' }],
      links: [{ url: 'https://example.com/', display: 'example.com' }],
    });
  });

  it('refuses the same post twice', () => {
    const one = exportedPost(post('1'));
    expect(problemOf(file({ posts: [one, one], postTags: [] }))).toEqual({
      kind: 'duplicate',
      section: 'posts',
      position: 2,
    });
  });

  it.each<[string, Record<string, unknown>, BackupProblem]>([
    [
      'a post ID that is not one',
      { postId: 'two' },
      { kind: 'invalid', section: 'postTags', position: 1 },
    ],
    ['a bad time', { taggedAt: null }, { kind: 'invalid', section: 'postTags', position: 1 }],
    [
      'a post the file lacks',
      { postId: '7' },
      { kind: 'dangling', section: 'postTags', position: 1 },
    ],
    [
      'a tag the file lacks',
      { tagId: 't-go' },
      { kind: 'dangling', section: 'postTags', position: 1 },
    ],
  ])('refuses a tag assignment with %s', (_, changes, problem) => {
    expect(
      problemOf(file({ postTags: [{ postId: '2', tagId: 't-rust', taggedAt: DAY, ...changes }] })),
    ).toEqual(problem);
  });

  it('refuses a post tagged twice with one tag', () => {
    const one = { postId: '2', tagId: 't-rust', taggedAt: DAY };
    expect(problemOf(file({ postTags: [one, { ...one, taggedAt: DAY + 1 }] }))).toEqual({
      kind: 'duplicate',
      section: 'postTags',
      position: 2,
    });
  });
});

describe('readBackup', () => {
  it('does not read a file over the size limit', async () => {
    const text = vi.fn(() => Promise.resolve('{}'));
    const result = await readBackup({ size: 11, text }, { ...DEFAULT_IMPORT_LIMITS, bytes: 10 });
    expect(result).toEqual({ ok: false, problem: { kind: 'too-large' } });
    expect(text).not.toHaveBeenCalled();
  });

  it('says when the browser cannot read the file', async () => {
    const result = await readBackup({ size: 1, text: () => Promise.reject(new Error('gone')) });
    expect(result).toEqual({ ok: false, problem: { kind: 'unreadable' } });
  });

  it('parses what it reads', async () => {
    const text = JSON.stringify(file());
    expect((await readBackup(new Blob([text]))).ok).toBe(true);
  });
});

describe('backupSummary', () => {
  it('counts the library posts, leaving out quoted ones', async () => {
    const backup = parsed(JSON.parse(await exported(db)));
    expect(backupSummary(backup)).toEqual({
      accountId: ACCOUNT,
      posts: 3,
      tags: 3,
      postTags: 4,
      exportedAt: new Date(DAY).toISOString(),
      partial: false,
    });
  });

  it('says when the file holds part of a library', async () => {
    const backup = parsed(JSON.parse(await exported(db, { postIds: ['3'] })));
    expect(backupSummary(backup)).toMatchObject({ posts: 1, tags: 1, postTags: 1, partial: true });
  });
});

describe('mergeImported', () => {
  const incoming = (changes: Partial<StoredPost> = {}): ExportedPost =>
    exportedPost(post('1', changes));

  it('stores a new post as the file has it, stored now and untagged until its tags are written', () => {
    expect(mergeImported(undefined, incoming(), OTHER, NOW)).toEqual({
      ...post('1'),
      accountId: OTHER,
      lastSeenAt: NOW,
    });
  });

  it('takes the content of the copy stored from X more recently', () => {
    const stored = post('1', { text: 'Older', lastSeenAt: DAY });
    expect(
      mergeImported(stored, incoming({ text: 'Newer', lastSeenAt: DAY + 1 }), ACCOUNT, NOW).text,
    ).toBe('Newer');
    expect(
      mergeImported(stored, incoming({ text: 'Stale', lastSeenAt: DAY - 1 }), ACCOUNT, NOW).text,
    ).toBe('Older');
  });

  it('never replaces a full copy with a partial one, whichever is newer', () => {
    const full = post('1', { text: 'Full', lastSeenAt: DAY });
    const fromFile = mergeImported(
      full,
      incoming({ text: 'Partial', partial: true, lastSeenAt: DAY + 1 }),
      ACCOUNT,
      NOW,
    );
    expect(fromFile).toMatchObject({ text: 'Full', partial: false });
    const partial = post('1', { text: 'Partial', partial: true, lastSeenAt: DAY + 1 });
    expect(
      mergeImported(partial, incoming({ text: 'Full', lastSeenAt: DAY }), ACCOUNT, NOW),
    ).toMatchObject({
      text: 'Full',
      partial: false,
    });
  });

  it('combines sources, each keeping the newer copy’s position when it has one', () => {
    const stored = post('1', { bookmarkSort: sortKey('1'), lastSeenAt: DAY });
    const merged = mergeImported(
      stored,
      incoming({
        bookmarkSort: sortKey('2'),
        isLike: 1,
        likeSort: sortKey('3'),
        lastSeenAt: DAY + 1,
      }),
      ACCOUNT,
      NOW,
    );
    expect(merged).toMatchObject({
      isBookmark: 1,
      bookmarkSort: sortKey('2'),
      isLike: 1,
      likeSort: sortKey('3'),
    });
  });

  it('keeps the older copy’s position in a source the newer copy is not in', () => {
    const stored = post('1', { isLike: 1, likeSort: sortKey('3'), lastSeenAt: DAY });
    const merged = mergeImported(stored, incoming({ lastSeenAt: DAY + 1 }), ACCOUNT, NOW);
    expect(merged).toMatchObject({ isLike: 1, likeSort: sortKey('3') });
    const none = mergeImported(
      post('1', { isBookmark: 0, bookmarkSort: undefined }),
      incoming({ isBookmark: 0, bookmarkSort: undefined }),
      ACCOUNT,
      NOW,
    );
    expect(none).not.toHaveProperty('bookmarkSort');
    expect(none).not.toHaveProperty('likeSort');
  });

  it('follows the newer copy on whether X still has the post', () => {
    const stored = post('1', { unavailable: true, lastSeenAt: DAY });
    expect(mergeImported(stored, incoming({ lastSeenAt: DAY + 1 }), ACCOUNT, NOW).unavailable).toBe(
      false,
    );
    expect(mergeImported(stored, incoming({ lastSeenAt: DAY - 1 }), ACCOUNT, NOW).unavailable).toBe(
      true,
    );
  });

  it('keeps the earlier times of first sight and of entering the library, and its tags', () => {
    const stored = post('1', { firstSeenAt: DAY, savedAt: DAY + 5, hasTags: 1 });
    const merged = mergeImported(
      stored,
      incoming({ firstSeenAt: DAY + 1, savedAt: DAY + 2 }),
      ACCOUNT,
      NOW,
    );
    expect(merged).toMatchObject({
      firstSeenAt: DAY,
      savedAt: DAY + 2,
      hasTags: 1,
      lastSeenAt: NOW,
    });
  });
});

describe('importBackup', () => {
  it('reproduces an exported library in an empty one', async () => {
    const backup = parsed(JSON.parse(await exported(db)));
    const target = fresh();
    const result = await importBackup(target, backup, 'merge', { now: NOW });
    expect(result).toEqual({ accountId: ACCOUNT, posts: 3, tags: 3 });
    expect(await contents(target)).toEqual(await contents(db));
    expect(await activeAccount(target)).toBe(ACCOUNT);
    const stored = await target.posts.toArray();
    expect(stored.every((p) => p.lastSeenAt === NOW)).toBe(true);
    expect(stored.find((p) => p.id === '9')).toMatchObject({
      isBookmark: 0,
      isLike: 0,
      hasTags: 0,
    });
  });

  it('reproduces it by replacing too', async () => {
    const backup = parsed(JSON.parse(await exported(db)));
    const target = fresh();
    await importBackup(target, backup, 'replace', { now: NOW });
    expect(await contents(target)).toEqual(await contents(db));
  });

  it('merges tags by name, keeping the library’s name and colour', async () => {
    const backup = parsed(
      file({
        tags: [{ id: 't-other', name: 'GO', color: 9, createdAt: DAY - 10, lastUsedAt: DAY + 50 }],
        postTags: [{ postId: '2', tagId: 't-other', taggedAt: DAY - 5 }],
      }),
    );
    await importBackup(db, backup, 'merge', { now: NOW });
    expect(await db.tags.get([ACCOUNT, 't-go'])).toEqual(
      tag('t-go', 'Go', { createdAt: DAY - 10, lastUsedAt: DAY + 50 }),
    );
    expect(await db.tags.get([ACCOUNT, 't-other'])).toBeUndefined();
    // Post 2 had Go already: the earlier tagging time is kept.
    expect(await db.postTags.get([ACCOUNT, '2', 't-go'])).toEqual(link('2', 't-go', DAY - 5));
  });

  it('keeps the earlier tagging time when the library tagged the post first', async () => {
    const backup = parsed(
      file({
        tags: [{ id: 't-rust', name: 'rust', color: 3, createdAt: DAY, lastUsedAt: DAY }],
        postTags: [{ postId: '2', tagId: 't-rust', taggedAt: DAY + 100 }],
      }),
    );
    await importBackup(db, backup, 'merge', { now: NOW });
    expect(await db.postTags.get([ACCOUNT, '2', 't-rust'])).toEqual(link('2', 't-rust', DAY + 3));
  });

  it('gives a new tag another ID when the library uses its ID for another name', async () => {
    const ids = ['t-go', 't-new'];
    const backup = parsed(
      file({
        tags: [{ id: 't-go', name: 'cooking', color: 5, createdAt: DAY, lastUsedAt: DAY }],
        postTags: [{ postId: '1', tagId: 't-go', taggedAt: DAY }],
      }),
    );
    await importBackup(db, backup, 'merge', { now: NOW, newId: () => ids.shift()! });
    expect(await db.tags.get([ACCOUNT, 't-new'])).toEqual(tag('t-new', 'cooking', { color: 5 }));
    expect(await db.tags.get([ACCOUNT, 't-go'])).toEqual(tag('t-go', 'Go'));
    expect(await db.postTags.get([ACCOUNT, '1', 't-new'])).toEqual(link('1', 't-new', DAY));
  });

  it('adds new posts and marks the tagged ones, leaving the rest of the library', async () => {
    const backup = parsed(
      file({
        posts: [exportedPost(post('20', { isBookmark: 0, bookmarkSort: undefined }))],
        postTags: [{ postId: '20', tagId: 't-rust', taggedAt: DAY }],
      }),
    );
    const result = await importBackup(db, backup, 'merge', { now: NOW });
    expect(result).toEqual({ accountId: ACCOUNT, posts: 1, tags: 1 });
    expect(await db.posts.get([ACCOUNT, '20'])).toMatchObject({ hasTags: 1, lastSeenAt: NOW });
    expect((await db.posts.toArray()).filter((p) => p.accountId === ACCOUNT)).toHaveLength(5);
    expect(await db.tags.get([ACCOUNT, 't-unused'])).toBeDefined();
  });

  it('replaces only the file’s account, everything in it', async () => {
    const backup = parsed(file());
    const result = await importBackup(db, backup, 'replace', { now: NOW });
    expect(result).toEqual({ accountId: ACCOUNT, posts: 2, tags: 1 });
    const ids = (await db.posts.toArray()).filter((p) => p.accountId === ACCOUNT).map((p) => p.id);
    expect(ids.sort()).toEqual(['1', '2']);
    expect((await db.tags.toArray()).map((t) => `${t.accountId}:${t.name}`).sort()).toEqual([
      `${ACCOUNT}:rust`,
      `${OTHER}:else`,
    ]);
    expect(await db.postTags.toArray()).toEqual([
      link('2', 't-rust', DAY),
      link('1', 't-else', DAY, OTHER),
    ]);
    expect(await db.posts.get([OTHER, '1'])).toBeDefined();
    expect(await db.posts.get([ACCOUNT, '1'])).toMatchObject({ hasTags: 0 });
  });

  it('writes to the file’s account and shows it, whichever account was shown', async () => {
    await db.meta.put({ accountId: '', key: 'activeAccount', value: ACCOUNT });
    const backup = parsed(file({ accountId: OTHER }));
    await importBackup(db, backup, 'merge', { now: NOW });
    expect(await db.posts.get([OTHER, '2'])).toMatchObject({ hasTags: 1 });
    expect(await activeAccount(db)).toBe(OTHER);
  });

  it('will not replace a library with part of one, and writes nothing', async () => {
    const backup = parsed(file({ scope: 'partial' }));
    const before = await contents(db);
    await expect(importBackup(db, backup, 'replace')).rejects.toThrow(PartialReplaceError);
    expect(await contents(db)).toEqual(before);
  });

  it('writes nothing when any write fails', async () => {
    const backup = parsed(file({ posts: [exportedPost(post('20'))], postTags: [] }));
    const before = await contents(db);
    const put = vi.spyOn(db.postTags, 'bulkPut').mockRejectedValueOnce(new Error('full'));
    await expect(importBackup(db, backup, 'replace')).rejects.toThrow('full');
    put.mockRestore();
    expect(await contents(db)).toEqual(before);
  });
});

describe('createLibraryImport', () => {
  it('announces the account it wrote to', async () => {
    const announce = vi.fn();
    const importer = createLibraryImport(db, announce, { now: NOW });
    const result = await importer.write(parsed(file({ accountId: OTHER })), 'merge');
    expect(result).toEqual({ accountId: OTHER, posts: 2, tags: 1 });
    expect(announce).toHaveBeenCalledWith(OTHER);
  });

  it('resolves to undefined, announcing nothing, when the import fails', async () => {
    const announce = vi.fn();
    const importer = createLibraryImport(db, announce);
    expect(await importer.write(parsed(file({ scope: 'partial' })), 'replace')).toBeUndefined();
    expect(announce).not.toHaveBeenCalled();
  });

  it('reads with its limits', async () => {
    const importer = createLibraryImport(db, vi.fn(), {
      limits: { ...DEFAULT_IMPORT_LIMITS, bytes: 1 },
    });
    expect(await importer.read(new Blob(['{}{}']))).toEqual({
      ok: false,
      problem: { kind: 'too-large' },
    });
  });
});

describe('changeImport', () => {
  const backup = parsed(file());
  const summary = backupSummary(backup);
  const preview: ImportFlow = { step: 'preview', backup, summary };
  const partial = parsed(file({ scope: 'partial' }));
  const partialPreview: ImportFlow = {
    step: 'preview',
    backup: partial,
    summary: backupSummary(partial),
  };
  const result = { accountId: ACCOUNT, posts: 2, tags: 1 };

  it('reads a picked file only when nothing else is under way', () => {
    expect(changeImport({ step: 'idle', status: 'Imported 1 post' }, { type: 'read' })).toEqual({
      step: 'reading',
    });
    expect(changeImport(preview, { type: 'read' })).toBe(preview);
  });

  it('previews a file that passed its checks, and says why one did not', () => {
    const reading: ImportFlow = { step: 'reading' };
    expect(changeImport(reading, { type: 'parsed', result: { ok: true, backup } })).toEqual(
      preview,
    );
    expect(
      changeImport(reading, {
        type: 'parsed',
        result: { ok: false, problem: { kind: 'not-json' } },
      }),
    ).toEqual({
      step: 'idle',
      status: problemMessage({ kind: 'not-json' }),
    });
    expect(changeImport(IDLE, { type: 'parsed', result: { ok: true, backup } })).toBe(IDLE);
  });

  it('cancels from the preview, leaving nothing to say', () => {
    expect(changeImport(preview, { type: 'cancel' })).toBe(IDLE);
    const importing: ImportFlow = { step: 'importing', mode: 'merge', summary };
    expect(changeImport(importing, { type: 'cancel' })).toBe(importing);
  });

  it('imports from the preview, by merge or replace', () => {
    expect(changeImport(preview, { type: 'write', mode: 'merge' })).toEqual({
      step: 'importing',
      mode: 'merge',
      summary,
    });
    expect(changeImport(preview, { type: 'write', mode: 'replace' })).toEqual({
      step: 'importing',
      mode: 'replace',
      summary,
    });
    expect(changeImport(IDLE, { type: 'write', mode: 'merge' })).toBe(IDLE);
  });

  it('never replaces with part of a library', () => {
    expect(changeImport(partialPreview, { type: 'write', mode: 'replace' })).toBe(partialPreview);
    expect(changeImport(partialPreview, { type: 'write', mode: 'merge' }).step).toBe('importing');
  });

  it('says how the import went once it is done', () => {
    const importing: ImportFlow = { step: 'importing', mode: 'merge', summary };
    expect(changeImport(importing, { type: 'written', result })).toEqual({
      step: 'idle',
      status: importStatus(result),
    });
    expect(changeImport(importing, { type: 'written', result: undefined })).toEqual({
      step: 'idle',
      status: importStatus(undefined),
    });
    expect(changeImport(preview, { type: 'written', result })).toBe(preview);
  });

  it('is busy while reading or writing', () => {
    expect(
      [IDLE, { step: 'reading' }, preview, { step: 'importing', mode: 'merge', summary }].map(
        (flow) => isBusy(flow as ImportFlow),
      ),
    ).toEqual([false, true, false, true]);
  });
});

describe('import messages', () => {
  it.each<[BackupProblem, string]>([
    [{ kind: 'too-large' }, 'This file is too large to import.'],
    [{ kind: 'unreadable' }, 'The file could not be read. Try again.'],
    [
      { kind: 'not-json' },
      'This is not a JSON backup. Only JSON backups from xorganize can be imported; CSV files cannot.',
    ],
    [{ kind: 'not-export' }, 'This file is not an xorganize backup.'],
    [
      { kind: 'newer-version', version: 2 },
      'This backup was made by a newer version of xorganize. Update the extension, then import it.',
    ],
    [
      { kind: 'too-many', section: 'postTags' },
      'This file holds more tag assignments than can be imported.',
    ],
    [
      { kind: 'invalid', section: 'posts', position: 1200 },
      'The file is damaged: post 1,200 is not valid. Nothing was imported.',
    ],
    [
      { kind: 'duplicate', section: 'tags', position: 2 },
      'The file is damaged: tag 2 appears twice. Nothing was imported.',
    ],
    [
      { kind: 'dangling', section: 'postTags', position: 3 },
      'The file is damaged: tag assignment 3 refers to a post or tag it does not hold. Nothing was imported.',
    ],
  ])('explains %j', (problem, message) => {
    expect(problemMessage(problem)).toBe(message);
  });

  const summary = {
    accountId: ACCOUNT,
    posts: 1950,
    tags: 40,
    postTags: 1203,
    exportedAt: new Date(DAY).toISOString(),
    partial: false,
  };

  it('previews what the file holds and when it was made', () => {
    const lines = previewLines(summary, ACCOUNT);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^1,950 posts, 40 tags and 1,203 tag assignments, exported .*2026\.$/);
    expect(previewLines(summary, undefined)).toHaveLength(1);
  });

  it('says when the file holds part of a library, or another account’s', () => {
    expect(previewLines({ ...summary, partial: true }, ACCOUNT)[1]).toMatch(/only be merged/);
    expect(previewLines(summary, OTHER)[1]).toMatch(/different X account/);
  });

  it('says what Replace deletes', () => {
    expect(REPLACE_WARNING).toMatch(/deletes/);
  });

  it('says how the import went', () => {
    expect(importStatus({ accountId: ACCOUNT, posts: 1, tags: 2 })).toBe(
      'Imported 1 post and 2 tags',
    );
    expect(importStatus(undefined)).toBe('Could not import. Nothing was changed.');
  });
});
