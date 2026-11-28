import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import { activeAccount, clearSource, removePost, restorePost, saveCapture } from '@/src/db/repo';
import { LibraryDatabase } from '@/src/db/schema';
import {
  UnknownPostError,
  deleteTag,
  mergeTags,
  recentTags,
  recolourTag,
  renameTag,
  setPostTags,
  suggestTags,
  tagsForPosts,
  useCount,
  type TagChange,
} from '@/src/db/tags';
import { rawPost, type RawPostOptions } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';

let db: LibraryDatabase;
let databases = 0;
let ids = 0;
let clock = 1000;

beforeEach(() => {
  db = new LibraryDatabase(`tags-test-${++databases}`);
  ids = 0;
  clock = 1000;
});

const post = (id: string, options: Partial<RawPostOptions> = {}) =>
  normalisePost(rawPost({ id, ...options }))!;

/** Applies a change with a predictable clock and predictable ids. */
const change = (partial: Partial<TagChange> & { postId: string }) =>
  setPostTags(
    db,
    { accountId: ACCOUNT, add: [], remove: [], ...partial },
    { now: (clock += 10), newId: () => `tag-${++ids}` },
  );

const stored = (id: string, accountId = ACCOUNT) => db.posts.get([accountId, id]);

describe('setPostTags', () => {
  it('makes the account active, so a library of tagged posts only is shown', async () => {
    expect(await activeAccount(db)).toBeUndefined();
    await change({ postId: '1', add: ['Rust'], post: post('1') });
    expect(await activeAccount(db)).toBe(ACCOUNT);
  });

  it('leaves the active account alone when nothing is stored', async () => {
    await change({ postId: '1', add: [], remove: ['nothing'] });
    expect(await activeAccount(db)).toBeUndefined();
  });

  it('stores a post seen anywhere when it is tagged, without bookmarking or liking it', async () => {
    const tags = await change({ postId: '1', add: ['Rust', 'to read'], post: post('1') });

    expect(tags).toEqual([
      { id: 'tag-1', name: 'Rust', color: 0 },
      { id: 'tag-2', name: 'to read', color: 1 },
    ]);
    expect(await stored('1')).toMatchObject({
      hasTags: 1,
      isBookmark: 0,
      isLike: 0,
      partial: false,
    });
  });

  it('keeps the post’s own bookmark and like state as the API reported it', async () => {
    await change({ postId: '1', add: ['rust'], post: post('1', { favorited: true }) });
    expect(await stored('1')).toMatchObject({ hasTags: 1, isBookmark: 0, isLike: 1 });
  });

  it('reuses a tag whatever its casing or spacing, and keeps the first casing', async () => {
    await change({ postId: '1', add: ['To Read'], post: post('1') });
    const tags = await change({ postId: '2', add: [' to  read '], post: post('2') });
    expect(tags).toEqual([{ id: 'tag-1', name: 'To Read', color: 0 }]);
    expect(await db.tags.count()).toBe(1);
  });

  it('adds a tag once however often it is applied', async () => {
    await change({ postId: '1', add: ['rust', 'RUST'], post: post('1') });
    const tags = await change({ postId: '1', add: ['rust'] });
    expect(tags.map((tag) => tag.name)).toEqual(['rust']);
    expect(await useCount(db, ACCOUNT, 'tag-1')).toBe(1);
  });

  it('skips names that are not valid', async () => {
    const tags = await change({ postId: '1', add: ['', 'a;b', 'ok'], post: post('1') });
    expect(tags.map((tag) => tag.name)).toEqual(['ok']);
  });

  it('tags a stored post without being sent it again', async () => {
    await saveCapture(db, {
      accountId: ACCOUNT,
      source: 'bookmark',
      items: [{ post: post('1'), sortIndex: '5' }],
      referenced: [],
      unavailable: [],
    });
    expect(await change({ postId: '1', add: ['rust'] })).toHaveLength(1);
    expect(await stored('1')).toMatchObject({ hasTags: 1, isBookmark: 1 });
  });

  it('refuses to tag a post it has never seen', async () => {
    await expect(change({ postId: '1', add: ['rust'] })).rejects.toBeInstanceOf(UnknownPostError);
    expect(await db.tags.count()).toBe(0);
  });

  it('does not let a copy read from the page replace a full one', async () => {
    await change({ postId: '1', add: ['a'], post: post('1', { text: 'Full text' }) });
    await change({
      postId: '1',
      add: ['b'],
      post: post('1', { text: 'From the page' }),
      partial: true,
    });
    expect(await stored('1')).toMatchObject({ text: 'Full text', partial: false });
  });

  it('removes tags, and the post once nothing keeps it', async () => {
    await change({ postId: '1', add: ['a', 'b'], post: post('1') });
    expect(await change({ postId: '1', remove: ['tag-1'] })).toEqual([
      { id: 'tag-2', name: 'b', color: 1 },
    ]);
    expect(await change({ postId: '1', remove: ['tag-2'] })).toEqual([]);
    expect(await stored('1')).toBeUndefined();
    // The tags themselves stay, for later use.
    expect(await db.tags.count()).toBe(2);
  });

  it('keeps a bookmarked post when its last tag is removed', async () => {
    await change({ postId: '1', add: ['a'], post: post('1', { bookmarked: true }) });
    await change({ postId: '1', remove: ['tag-1'] });
    expect(await stored('1')).toMatchObject({ hasTags: 0, isBookmark: 1 });
  });

  it('keeps a tagged post when its bookmark is removed', async () => {
    await change({ postId: '1', add: ['a'], post: post('1', { bookmarked: true }) });
    await clearSource(db, ACCOUNT, '1', 'bookmark');
    expect(await stored('1')).toMatchObject({ hasTags: 1, isBookmark: 0 });
  });

  it('keeps each account’s tags apart', async () => {
    await change({ postId: '1', add: ['rust'], post: post('1') });
    await setPostTags(
      db,
      { accountId: OTHER, postId: '1', add: ['rust'], remove: [], post: post('1') },
      { now: 5000, newId: () => 'other-tag' },
    );
    expect((await tagsForPosts(db, ACCOUNT, ['1'])).get('1')).toEqual([
      { id: 'tag-1', name: 'rust', color: 0 },
    ]);
    expect((await tagsForPosts(db, OTHER, ['1'])).get('1')).toEqual([
      { id: 'other-tag', name: 'rust', color: 0 },
    ]);
  });
});

describe('tagsForPosts', () => {
  it('lists each post’s tags in the order they were applied, and none for untagged posts', async () => {
    await change({ postId: '1', add: ['b'], post: post('1') });
    await change({ postId: '1', add: ['a'] });
    const found = await tagsForPosts(db, ACCOUNT, ['1', '2', '1']);
    expect([...found.keys()]).toEqual(['1', '2']);
    expect(found.get('1')!.map((tag) => tag.name)).toEqual(['b', 'a']);
    expect(found.get('2')).toEqual([]);
  });
});

describe('suggestTags and recentTags', () => {
  beforeEach(async () => {
    await change({ postId: '1', add: ['typescript', 'typography', 'rust'], post: post('1') });
    await change({ postId: '2', add: ['typescript', 'rusty types'], post: post('2') });
    await change({ postId: '3', add: ['typescript'], post: post('3') });
  });

  it('ranks names that start with the query first, then by use', async () => {
    const found = await suggestTags(db, ACCOUNT, 'TY', 10);
    expect(found.map((tag) => [tag.name, tag.count])).toEqual([
      ['typescript', 3],
      ['typography', 1],
      ['rusty types', 1],
    ]);
  });

  it('offers every tag for an empty query, up to the limit', async () => {
    expect(await suggestTags(db, ACCOUNT, '', 2)).toHaveLength(2);
  });

  it('lists the most recently used tags first', async () => {
    expect((await recentTags(db, ACCOUNT, 3)).map((tag) => tag.name)).toEqual([
      'typescript',
      'rusty types',
      'rust',
    ]);
  });

  it('suggests nothing from another account', async () => {
    expect(await suggestTags(db, OTHER, 'ty', 10)).toEqual([]);
    expect(await recentTags(db, OTHER)).toEqual([]);
  });
});

describe('renameTag', () => {
  beforeEach(async () => {
    await change({ postId: '1', add: ['rust', 'go'], post: post('1') });
  });

  it('renames a tag on every post that carries it', async () => {
    expect(await renameTag(db, ACCOUNT, 'tag-1', ' Rust  lang ')).toEqual({
      ok: true,
      tag: { id: 'tag-1', name: 'Rust lang', color: 0 },
    });
    expect((await tagsForPosts(db, ACCOUNT, ['1'])).get('1')![0]!.name).toBe('Rust lang');
    expect(await suggestTags(db, ACCOUNT, 'rust l', 5)).toHaveLength(1);
  });

  it('allows a change of casing alone', async () => {
    expect(await renameTag(db, ACCOUNT, 'tag-1', 'RUST')).toMatchObject({ ok: true });
  });

  it('refuses a name another tag has, which would be a merge', async () => {
    expect(await renameTag(db, ACCOUNT, 'tag-1', 'Go')).toEqual({ ok: false, problem: 'taken' });
    expect((await db.tags.get([ACCOUNT, 'tag-1']))!.name).toBe('rust');
  });

  it('refuses a name that is not valid, and a tag that does not exist', async () => {
    expect(await renameTag(db, ACCOUNT, 'tag-1', ' ')).toEqual({ ok: false, problem: 'empty' });
    expect(await renameTag(db, ACCOUNT, 'tag-1', 'a;b')).toEqual({
      ok: false,
      problem: 'semicolon',
    });
    expect(await renameTag(db, OTHER, 'tag-1', 'new')).toEqual({ ok: false, problem: 'missing' });
  });
});

describe('recolourTag', () => {
  it('sets a colour from the palette, and nothing else', async () => {
    await change({ postId: '1', add: ['rust'], post: post('1') });
    expect(await recolourTag(db, ACCOUNT, 'tag-1', 11)).toBe(true);
    expect((await db.tags.get([ACCOUNT, 'tag-1']))!.color).toBe(11);
    for (const colour of [-1, 12, 1.5, Number.NaN]) {
      expect(await recolourTag(db, ACCOUNT, 'tag-1', colour)).toBe(false);
    }
    expect(await recolourTag(db, ACCOUNT, 'tag-9', 2)).toBe(false);
    expect((await db.tags.get([ACCOUNT, 'tag-1']))!.color).toBe(11);
  });
});

describe('mergeTags', () => {
  beforeEach(async () => {
    await change({ postId: '1', add: ['rust'], post: post('1') }); // tag-1, at 1010
    await change({ postId: '2', add: ['rustlang'], post: post('2') }); // tag-2, at 1020
    await change({ postId: '2', add: ['rust'] }); // at 1030
  });

  it('moves every post to the other tag and removes the first', async () => {
    expect(await mergeTags(db, ACCOUNT, 'tag-1', 'tag-2')).toBe(true);
    expect(await db.tags.get([ACCOUNT, 'tag-1'])).toBeUndefined();
    const found = await tagsForPosts(db, ACCOUNT, ['1', '2']);
    expect(found.get('1')).toEqual([{ id: 'tag-2', name: 'rustlang', color: 1 }]);
    expect(found.get('2')).toEqual([{ id: 'tag-2', name: 'rustlang', color: 1 }]);
    expect(await useCount(db, ACCOUNT, 'tag-2')).toBe(2);
    // Post 2 had both: it keeps the earlier time. Post 1 keeps its own.
    expect((await db.postTags.get([ACCOUNT, '2', 'tag-2']))!.taggedAt).toBe(1020);
    expect((await db.postTags.get([ACCOUNT, '1', 'tag-2']))!.taggedAt).toBe(1010);
    // Most recently used: the later of the two.
    expect((await db.tags.get([ACCOUNT, 'tag-2']))!.lastUsedAt).toBe(1030);
  });

  it('changes nothing for the same tag twice, or a tag that does not exist', async () => {
    expect(await mergeTags(db, ACCOUNT, 'tag-1', 'tag-1')).toBe(false);
    expect(await mergeTags(db, ACCOUNT, 'tag-1', 'tag-9')).toBe(false);
    expect(await mergeTags(db, OTHER, 'tag-1', 'tag-2')).toBe(false);
    expect(await db.tags.count()).toBe(2);
    expect(await useCount(db, ACCOUNT, 'tag-1')).toBe(2);
  });
});

describe('deleteTag', () => {
  it('takes the tag off every post, and removes only posts nothing else keeps', async () => {
    await change({ postId: '1', add: ['old'], post: post('1') }); // only this tag
    await change({ postId: '2', add: ['old', 'keep'], post: post('2') }); // another tag
    await change({ postId: '3', add: ['old'], post: post('3', { bookmarked: true }) });
    await change({ postId: '4', add: ['keep'], post: post('4') }); // not carrying it

    expect(await deleteTag(db, ACCOUNT, 'tag-1')).toEqual({ untagged: 3, removed: 1 });
    expect(await db.tags.get([ACCOUNT, 'tag-1'])).toBeUndefined();
    expect(await stored('1')).toBeUndefined();
    expect(await stored('2')).toMatchObject({ hasTags: 1 });
    expect(await stored('3')).toMatchObject({ hasTags: 0, isBookmark: 1 });
    expect(await stored('4')).toMatchObject({ hasTags: 1 });
    expect(await db.postTags.count()).toBe(2);
  });

  it('removes a tag on no post', async () => {
    await change({ postId: '1', add: ['a'], post: post('1', { bookmarked: true }) });
    await change({ postId: '1', remove: ['tag-1'] });
    expect(await deleteTag(db, ACCOUNT, 'tag-1')).toEqual({ untagged: 0, removed: 0 });
    expect(await db.tags.count()).toBe(0);
  });
});

describe('removePost', () => {
  it('takes the post and its tags out of the library, and leaves the tags themselves', async () => {
    await change({ postId: '1', add: ['a', 'b'], post: post('1', { bookmarked: true }) });
    await change({ postId: '2', add: ['a'], post: post('2') });
    await removePost(db, ACCOUNT, '1');
    expect(await stored('1')).toBeUndefined();
    expect(await useCount(db, ACCOUNT, 'tag-1')).toBe(1);
    expect(await useCount(db, ACCOUNT, 'tag-2')).toBe(0);
    expect(await db.tags.count()).toBe(2);
  });

  it('returns nothing for a post that is not there', async () => {
    expect(await removePost(db, ACCOUNT, '404')).toBeUndefined();
  });

  it('can be undone: the post and its tags come back as they were', async () => {
    await change({ postId: '1', add: ['a', 'b'], post: post('1', { bookmarked: true }) });
    const before = { post: await stored('1'), tags: await db.postTags.toArray() };
    const removed = await removePost(db, ACCOUNT, '1');
    await restorePost(db, removed!);
    expect(await stored('1')).toEqual(before.post);
    expect(await db.postTags.toArray()).toEqual(before.tags);
  });

  it('leaves out a tag deleted before the undo, and keeps a copy stored again meanwhile', async () => {
    await change({ postId: '1', add: ['a', 'b'], post: post('1', { bookmarked: true }) });
    await change({ postId: '2', add: ['b'], post: post('2') });
    const removed = await removePost(db, ACCOUNT, '1');
    await deleteTag(db, ACCOUNT, 'tag-1');
    await restorePost(db, removed!);
    expect(await useCount(db, ACCOUNT, 'tag-1')).toBe(0);
    expect(await useCount(db, ACCOUNT, 'tag-2')).toBe(2);
    expect((await stored('1'))?.hasTags).toBe(1);
  });

  it('marks a restored post untagged when none of its tags are left', async () => {
    await change({ postId: '1', add: ['a'], post: post('1', { bookmarked: true }) });
    const removed = await removePost(db, ACCOUNT, '1');
    await deleteTag(db, ACCOUNT, 'tag-1');
    await restorePost(db, removed!);
    expect((await stored('1'))?.hasTags).toBe(0);
    expect(await db.postTags.count()).toBe(0);
  });

  it('keeps the post as stored again from X, with the tags put back', async () => {
    await change({ postId: '1', add: ['a'], post: post('1', { bookmarked: true }) });
    const removed = await removePost(db, ACCOUNT, '1');
    await saveCapture(db, {
      accountId: ACCOUNT,
      source: 'like',
      items: [{ post: post('1', { favorited: true }) }],
      referenced: [],
      unavailable: [],
    });
    await restorePost(db, removed!);
    expect(await stored('1')).toMatchObject({ isLike: 1, hasTags: 1 });
    expect(await useCount(db, ACCOUNT, 'tag-1')).toBe(1);
  });
});
