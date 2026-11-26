import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import { authorsOf, saveCapture, savedIds, taggedIds, updateSettings } from '@/src/db/repo';
import { LibraryDatabase } from '@/src/db/schema';
import { postsWithTag, setPostTags, tagCounts } from '@/src/db/tags';
import type { TagSuggestion } from '@/src/db/types';
import { EMPTY_BROWSE, loadBrowse } from '@/src/library/browse';
import { PAGE_SIZE, pageSpan } from '@/src/library/paging';
import { loadPosts } from '@/src/library/posts';
import {
  byAuthor,
  byPostDate,
  comparePostDates,
  countSources,
  inSource,
  matchesTags,
  type SourceSets,
} from '@/src/library/select';
import { tagTree, type TagNode } from '@/src/library/tag-tree';
import {
  DEFAULT_VIEW,
  SOURCE_FILTERS,
  changeView,
  isFiltered,
  type View,
} from '@/src/library/view';
import { rawPost, type RawPostOptions } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';
const OTHER = '9000000000000000002';

describe('changeView', () => {
  const tagged = (...tags: string[]): View => ({ ...DEFAULT_VIEW, tags });

  it('selects a source, keeping the tags', () => {
    expect(changeView(tagged('a'), { type: 'source', source: 'likes' })).toEqual({
      ...tagged('a'),
      source: 'likes',
    });
  });

  it('shows only a clicked tag, and clears it when it was the only one', () => {
    expect(changeView(tagged('a', 'b'), { type: 'tag', tagId: 'c', add: false }).tags).toEqual([
      'c',
    ]);
    expect(changeView(tagged('a', 'b'), { type: 'tag', tagId: 'a', add: false }).tags).toEqual([
      'a',
    ]);
    expect(changeView(tagged('a'), { type: 'tag', tagId: 'a', add: false }).tags).toEqual([]);
  });

  it('adds a tag to the selection, or takes it out, when adding', () => {
    expect(changeView(tagged('a'), { type: 'tag', tagId: 'b', add: true }).tags).toEqual([
      'a',
      'b',
    ]);
    expect(changeView(tagged('a', 'b'), { type: 'tag', tagId: 'a', add: true }).tags).toEqual([
      'b',
    ]);
  });

  it('removes one tag, switches matching and order, and clears filters but not order', () => {
    expect(changeView(tagged('a', 'b'), { type: 'untag', tagId: 'a' }).tags).toEqual(['b']);
    expect(changeView(DEFAULT_VIEW, { type: 'match', match: 'any' }).match).toBe('any');
    expect(changeView(DEFAULT_VIEW, { type: 'sort', sort: 'author' }).sort).toBe('author');
    const busy: View = { source: 'likes', tags: ['a'], match: 'any', sort: 'posted' };
    expect(changeView(busy, { type: 'clear' })).toEqual({
      ...DEFAULT_VIEW,
      match: 'any',
      sort: 'posted',
    });
  });

  it('is filtered when it hides any post', () => {
    expect(isFiltered(DEFAULT_VIEW)).toBe(false);
    expect(isFiltered({ ...DEFAULT_VIEW, sort: 'author' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_VIEW, source: 'bookmarks' })).toBe(true);
    expect(isFiltered(tagged('a'))).toBe(true);
  });
});

describe('sources', () => {
  // 1 bookmarked, 2 liked, 3 both, 4 tagged only, 5 bookmarked and tagged.
  const sets: SourceSets = {
    bookmarks: new Set(['1', '3', '5']),
    likes: new Set(['2', '3']),
    tagged: new Set(['4', '5']),
  };
  const members = (source: (typeof SOURCE_FILTERS)[number]) =>
    ['1', '2', '3', '4', '5', '6'].filter(inSource(source, sets));

  it('puts each post in the sources it belongs to, and a quoted-only post in none', () => {
    expect(members('all')).toEqual(['1', '2', '3', '4', '5']);
    expect(members('bookmarks')).toEqual(['1', '3', '5']);
    expect(members('likes')).toEqual(['2', '3']);
    expect(members('tagged')).toEqual(['4']);
    expect(members('untagged')).toEqual(['1', '2', '3']);
  });

  it('counts each source, a post in two counted once in All', () => {
    expect(countSources(sets)).toEqual({
      all: 5,
      bookmarks: 3,
      likes: 2,
      tagged: 1,
      untagged: 3,
    });
  });
});

describe('matchesTags', () => {
  const rust = new Set(['1', '2']);
  const go = new Set(['2', '3']);
  const kept = (match: 'all' | 'any', ...tags: Set<string>[]) =>
    ['1', '2', '3', '4'].filter(matchesTags(tags, match));

  it('keeps every post when no tag is selected', () => {
    expect(kept('all')).toEqual(['1', '2', '3', '4']);
  });

  it('needs every tag, or any one of them', () => {
    expect(kept('all', rust, go)).toEqual(['2']);
    expect(kept('any', rust, go)).toEqual(['1', '2', '3']);
    expect(kept('all', rust)).toEqual(['1', '2']);
  });
});

describe('ordering', () => {
  it('orders post IDs newest first, beyond what a number holds', () => {
    expect(comparePostDates('1800000000000000002', '1800000000000000001')).toBeLessThan(0);
    expect(comparePostDates('99', '100')).toBeGreaterThan(0);
    expect(comparePostDates('7', '7')).toBe(0);
    expect(byPostDate(['20', '1800000000000000001', '1800000000000000002', '3'])).toEqual([
      '1800000000000000002',
      '1800000000000000001',
      '20',
      '3',
    ]);
  });

  it('orders by handle ignoring case, then newest first', () => {
    expect(
      byAuthor([
        { id: '1', handle: 'zed' },
        { id: '2', handle: 'Alice' },
        { id: '3', handle: 'alice' },
        { id: '4', handle: 'bob' },
      ]),
    ).toEqual(['3', '2', '4', '1']);
  });
});

describe('tagTree', () => {
  let ids = 0;
  const tag = (name: string): TagSuggestion => ({ id: `t${++ids}`, name, color: 0, count: 1 });
  /** Each node as its label, with its children nested, and `*` for a node that is a tag. */
  const shape = (nodes: TagNode[]): unknown =>
    nodes.map((node) =>
      node.children.length > 0
        ? { [`${node.label}${node.tag ? '*' : ''}`]: shape(node.children) }
        : `${node.label}${node.tag ? '*' : ''}`,
    );

  it('lists flat names by label, ignoring case', () => {
    expect(shape(tagTree([tag('recipes'), tag('AI'), tag('design')]))).toEqual([
      'AI*',
      'design*',
      'recipes*',
    ]);
  });

  it('nests names on `/`, with groups that are also tags and groups that are not', () => {
    const tree = tagTree([
      tag('dev/rust'),
      tag('dev'),
      tag('Dev/TypeScript'),
      tag('lang/fr/verbs'),
      tag('/odd//slashes/'),
    ]);
    expect(shape(tree)).toEqual([
      { 'dev*': ['rust*', 'TypeScript*'] },
      { lang: [{ fr: ['verbs*'] }] },
      { odd: ['slashes*'] },
    ]);
    expect(tree[0]!.children.map((node) => node.key)).toEqual(['dev/rust', 'dev/typescript']);
  });

  it('keeps two names with the same path apart', () => {
    const first = tag('a/b');
    const second = tag('a / b');
    const [group] = tagTree([first, second]);
    expect(group!.children.map((node) => [node.label, node.tag?.id])).toEqual([
      ['a / b', second.id],
      ['b', first.id],
    ]);
    expect(new Set(group!.children.map((node) => node.key)).size).toBe(2);
  });

  it('keeps a name made only of separators as it is', () => {
    expect(shape(tagTree([tag('/')]))).toEqual(['/*']);
  });
});

describe('pageSpan', () => {
  it('covers whole pages around the rows on screen', () => {
    expect(pageSpan(3, 10, 100, 25)).toEqual({ start: 0, end: 25 });
    expect(pageSpan(20, 30, 100, 25)).toEqual({ start: 0, end: 50 });
    expect(pageSpan(60, 60, 100, 25)).toEqual({ start: 50, end: 75 });
  });

  it('stops at the end of the list, and is empty when there are no rows', () => {
    expect(pageSpan(90, 99, 95, 25)).toEqual({ start: 75, end: 95 });
    expect(pageSpan(0, -1, 0)).toEqual({ start: 0, end: 0 });
    expect(pageSpan(5, 2, 50)).toEqual({ start: 0, end: 0 });
    expect(pageSpan(0, 0, 1000)).toEqual({ start: 0, end: PAGE_SIZE });
  });
});

describe('reading the library', () => {
  let db: LibraryDatabase;
  let databases = 0;
  let clock = 1000;
  let tagIds = 0;

  beforeEach(() => {
    db = new LibraryDatabase(`browse-test-${++databases}`);
    clock = 1000;
    tagIds = 0;
  });

  const post = (id: string, options: Partial<RawPostOptions> = {}) =>
    normalisePost(rawPost({ id, ...options }))!;

  const save = (
    source: 'bookmark' | 'like',
    items: Array<[id: string, sortIndex: string, options?: Partial<RawPostOptions>]>,
    accountId = ACCOUNT,
  ) =>
    saveCapture(
      db,
      {
        accountId,
        source,
        items: items.map(([id, sortIndex, options]) => ({ post: post(id, options), sortIndex })),
        referenced: [],
        unavailable: [],
      },
      (clock += 10),
    );

  const tag = (postId: string, add: string[], options: { post?: boolean } = {}) =>
    setPostTags(
      db,
      {
        accountId: ACCOUNT,
        postId,
        add,
        remove: [],
        ...(options.post ? { post: post(postId) } : {}),
      },
      { now: (clock += 10), newId: () => `tag-${++tagIds}` },
    );

  /**
   * Bookmarks 13, 12, 11 (11 also liked), likes 21 and 11, post 31 tagged
   * without a source, 12 tagged too. The bookmarks are saved together, then
   * 21, then 31; posts saved together are newest by ID first.
   */
  async function sample() {
    await save('bookmark', [
      ['13', '9003', { handle: 'zed' }],
      ['12', '9002', { handle: 'Alice' }],
      ['11', '9001', { handle: 'bob', favorited: true }],
    ]);
    await save('like', [['21', '8001', { handle: 'alice' }]]);
    await tag('31', ['Rust'], { post: true });
    await tag('12', ['Rust', 'go']);
  }

  it('lists tags by name with their counts, and the posts carrying each', async () => {
    await sample();
    expect(await tagCounts(db, ACCOUNT)).toEqual([
      { id: 'tag-2', name: 'go', color: 1, count: 1 },
      { id: 'tag-1', name: 'Rust', color: 0, count: 2 },
    ]);
    expect((await postsWithTag(db, ACCOUNT, 'tag-1')).sort()).toEqual(['12', '31']);
    expect(await postsWithTag(db, ACCOUNT, 'missing')).toEqual([]);
    expect(await tagCounts(db, OTHER)).toEqual([]);
  });

  it('reads IDs from indexes alone', async () => {
    await sample();
    expect((await taggedIds(db, ACCOUNT)).sort()).toEqual(['12', '31']);
    expect(await savedIds(db, ACCOUNT)).toEqual(['31', '21', '13', '12', '11']);
    expect(await authorsOf(db, ACCOUNT)).toEqual([
      { id: '12', handle: 'Alice' },
      { id: '21', handle: 'alice' },
      { id: '11', handle: 'bob' },
      { id: '31', handle: 'example_user' },
      { id: '13', handle: 'zed' },
    ]);
  });

  it('is empty, with the stored settings, before anything is captured', async () => {
    await updateSettings(db, { remoteImages: false });
    expect(await loadBrowse(db, DEFAULT_VIEW)).toEqual({
      ...EMPTY_BROWSE,
      settings: { remoteImages: false },
    });
  });

  it('counts sources and tags, and lists every post newest in the library first', async () => {
    await sample();
    const browse = await loadBrowse(db, DEFAULT_VIEW);
    expect(browse.account).toBe(ACCOUNT);
    expect(browse.counts).toEqual({ all: 5, bookmarks: 3, likes: 2, tagged: 1, untagged: 3 });
    expect(browse.tags.map((tag) => [tag.name, tag.count])).toEqual([
      ['go', 1],
      ['Rust', 2],
    ]);
    expect(browse.ids).toEqual(['31', '21', '13', '12', '11']);
    expect(browse.selected).toEqual([]);
    expect(browse.settings).toEqual({ remoteImages: true });
  });

  it('keeps each timeline in its own order', async () => {
    await sample();
    const bookmarks = await loadBrowse(db, { ...DEFAULT_VIEW, source: 'bookmarks' });
    expect(bookmarks.ids).toEqual(['13', '12', '11']);
    const likes = await loadBrowse(db, { ...DEFAULT_VIEW, source: 'likes' });
    expect(likes.ids).toEqual(['21', '11']);
  });

  it('shows tagged-only and untagged posts', async () => {
    await sample();
    expect((await loadBrowse(db, { ...DEFAULT_VIEW, source: 'tagged' })).ids).toEqual(['31']);
    expect((await loadBrowse(db, { ...DEFAULT_VIEW, source: 'untagged' })).ids).toEqual([
      '21',
      '13',
      '11',
    ]);
  });

  it('sorts by post date and by author', async () => {
    await sample();
    expect((await loadBrowse(db, { ...DEFAULT_VIEW, sort: 'posted' })).ids).toEqual([
      '31',
      '21',
      '13',
      '12',
      '11',
    ]);
    expect(
      (await loadBrowse(db, { ...DEFAULT_VIEW, source: 'bookmarks', sort: 'author' })).ids,
    ).toEqual(['12', '11', '13']);
  });

  it('filters by tags, all or any, within the source', async () => {
    await sample();
    const rust = await loadBrowse(db, { ...DEFAULT_VIEW, tags: ['tag-1'] });
    expect(rust.ids).toEqual(['31', '12']);
    expect(rust.selected.map((tag) => tag.name)).toEqual(['Rust']);

    const both = { ...DEFAULT_VIEW, tags: ['tag-2', 'tag-1'] };
    expect((await loadBrowse(db, both)).ids).toEqual(['12']);
    expect((await loadBrowse(db, both)).selected.map((tag) => tag.name)).toEqual(['go', 'Rust']);
    expect((await loadBrowse(db, { ...both, match: 'any' })).ids).toEqual(['31', '12']);
    expect((await loadBrowse(db, { ...both, source: 'tagged' })).ids).toEqual([]);
  });

  it('leaves out a selected tag that no longer exists', async () => {
    await sample();
    const browse = await loadBrowse(db, { ...DEFAULT_VIEW, tags: ['gone', 'tag-2'] });
    expect(browse.selected.map((tag) => tag.id)).toEqual(['tag-2']);
    expect(browse.ids).toEqual(['12']);
  });

  it('shows only the active account, and not posts kept only because they are quoted', async () => {
    await sample();
    await saveCapture(
      db,
      {
        accountId: ACCOUNT,
        source: 'bookmark',
        items: [{ post: post('41'), sortIndex: '9100' }],
        referenced: [post('40')],
        unavailable: [],
      },
      (clock += 10),
    );
    await save('bookmark', [['51', '1']], OTHER);
    await save('bookmark', [['14', '9200']]);

    const browse = await loadBrowse(db, DEFAULT_VIEW);
    expect(browse.ids).not.toContain('40');
    expect(browse.ids).not.toContain('51');
    expect(browse.counts.all).toBe(7);
  });

  it('reads cards with their tags in order and the post they quote', async () => {
    await saveCapture(
      db,
      {
        accountId: ACCOUNT,
        source: 'bookmark',
        items: [
          { post: post('62', { quoted: rawPost({ id: '60', text: 'Quoted' }) }), sortIndex: '2' },
          { post: post('61', { quoted: rawPost({ id: '59' }) }), sortIndex: '1' },
        ],
        referenced: [post('60', { text: 'Quoted' })],
        unavailable: [],
      },
      (clock += 10),
    );
    await tag('62', ['b']);
    await tag('62', ['a']);

    const cards = await loadPosts(db, ACCOUNT, ['62', '61', 'missing']);
    expect([...cards.keys()]).toEqual(['62', '61']);
    expect(cards.get('62')!.tags.map((tag) => tag.name)).toEqual(['b', 'a']);
    expect(cards.get('62')!.quoted?.text).toBe('Quoted');
    // A quoted post that was never stored is simply not shown.
    expect(cards.get('61')!.quoted).toBeUndefined();
    expect(cards.get('61')!.tags).toEqual([]);
    expect(await loadPosts(db, ACCOUNT, [])).toEqual(new Map());
  });
});
