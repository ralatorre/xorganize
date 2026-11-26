import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import { LibraryDatabase } from '@/src/db/schema';
import { setPostTags } from '@/src/db/tags';
import type { TagSummary } from '@/src/db/types';
import { createLibraryEdits, type LibraryEdits } from '@/src/library/edits';
import { POPOVER_SUGGESTIONS } from '@/src/inline/popover-model';
import { deletionImpact, deletionMessage, renameProblem } from '@/src/library/tag-actions';
import { createLibraryTagging } from '@/src/library/tagging';
import { rawPost } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';

let db: LibraryDatabase;
let databases = 0;
let announced: string[];
let edits: LibraryEdits;

beforeEach(async () => {
  db = new LibraryDatabase(`library-edits-test-${++databases}`);
  announced = [];
  edits = createLibraryEdits(db, (accountId) => void announced.push(accountId));
  let ids = 0;
  const tag = (postId: string, add: string[]) =>
    setPostTags(
      db,
      {
        accountId: ACCOUNT,
        postId,
        add,
        remove: [],
        post: normalisePost(rawPost({ id: postId }))!,
      },
      { newId: () => `tag-${++ids}` },
    );
  await tag('1', ['rust', 'go']); // tag-1, tag-2
  await tag('2', ['rust']);
});

describe('createLibraryEdits', () => {
  it('announces each write that changed something, for the account it changed', async () => {
    await edits.setTags(ACCOUNT, '1', { add: ['new'], remove: [] });
    await edits.rename(ACCOUNT, 'tag-1', 'Rust');
    await edits.recolour(ACCOUNT, 'tag-1', 3);
    await edits.merge(ACCOUNT, 'tag-2', 'tag-1');
    await edits.deleteTag(ACCOUNT, 'tag-1');
    await edits.removePost(ACCOUNT, '1');
    expect(announced).toEqual(Array(6).fill(ACCOUNT));
  });

  it('announces nothing for reads or refused changes', async () => {
    await edits.tagsOf(ACCOUNT, ['1']);
    await edits.suggest(ACCOUNT, 'ru', 5);
    await edits.rename(ACCOUNT, 'tag-1', 'go');
    await edits.recolour(ACCOUNT, 'tag-1', 99);
    await edits.merge(ACCOUNT, 'tag-1', 'tag-1');
    expect(announced).toEqual([]);
  });

  it('announces nothing when a write fails', async () => {
    await expect(edits.setTags(ACCOUNT, '404', { add: ['a'], remove: [] })).rejects.toThrow();
    expect(announced).toEqual([]);
  });

  it('suggests tags with the recently used ones', async () => {
    const found = await edits.suggest(ACCOUNT, 'ru', 5);
    expect(found.suggestions.map((tag) => [tag.name, tag.count])).toEqual([['rust', 2]]);
    expect(found.recent.map((tag) => tag.name)).toEqual(expect.arrayContaining(['rust', 'go']));
  });
});

describe('createLibraryTagging', () => {
  const tasks: Array<() => void> = [];
  const flush = async () => {
    while (tasks.length > 0) tasks.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const tagging = () =>
    createLibraryTagging({ edits, accountId: ACCOUNT, schedule: (task) => void tasks.push(task) });

  it('reads the tags of the post the popover shows', async () => {
    const { state } = tagging();
    const seen: TagSummary[][] = [];
    state.watch('1', (tags) => void seen.push(tags));
    await flush();
    expect(seen.at(-1)?.map((tag) => tag.name)).toEqual(['rust', 'go']);
  });

  it('saves a change, announces it, and shows what was saved', async () => {
    const { state, change } = tagging();
    state.watch('2', () => {});
    await flush();
    expect(await change('2', { add: ['go'], remove: ['tag-1'] })).toBe(true);
    expect(state.get('2')).toEqual([{ id: 'tag-2', name: 'go', color: 1 }]);
    expect(announced).toEqual([ACCOUNT]);
  });

  it('puts the tags back when the change cannot be saved', async () => {
    const failing = createLibraryTagging({
      edits: { ...edits, setTags: () => Promise.reject(new Error('quota')) },
      accountId: ACCOUNT,
      schedule: (task) => void tasks.push(task),
    });
    failing.state.watch('2', () => {});
    await flush();
    const before = failing.state.get('2');
    expect(await failing.change('2', { add: ['go'] })).toBe(false);
    expect(failing.state.get('2')).toEqual(before);
  });

  it('asks for as many suggestions as the popover shows, and survives failure', async () => {
    let limit = 0;
    const counted = createLibraryTagging({
      edits: {
        ...edits,
        suggest: (accountId, query, asked) => {
          limit = asked;
          return edits.suggest(accountId, query, asked);
        },
      },
      accountId: ACCOUNT,
      schedule: () => {},
    });
    expect((await counted.suggest('go'))?.suggestions.map((tag) => tag.name)).toEqual(['go']);
    expect(limit).toBe(POPOVER_SUGGESTIONS);

    const failing = createLibraryTagging({
      edits: { ...edits, suggest: () => Promise.reject(new Error('closed')) },
      accountId: ACCOUNT,
      schedule: () => {},
    });
    expect(await failing.suggest('go')).toBeUndefined();
  });
});

describe('deletionImpact', () => {
  const catalogue = {
    sets: {
      bookmarks: new Set(['1']),
      likes: new Set(['2']),
      tagged: new Set(['1', '2', '3', '4']),
    },
    tagged: new Map([
      ['old', new Set(['1', '2', '3', '4'])],
      ['keep', new Set(['4'])],
    ]),
  };

  it('counts the posts carrying the tag, and those it alone keeps in the library', () => {
    // 1 is bookmarked, 2 liked, 4 has another tag: only 3 leaves.
    expect(deletionImpact(catalogue, 'old')).toEqual({ posts: 4, leaving: 1 });
    expect(deletionImpact(catalogue, 'keep')).toEqual({ posts: 1, leaving: 0 });
    expect(deletionImpact(catalogue, 'none')).toEqual({ posts: 0, leaving: 0 });
  });
});

describe('deletionMessage', () => {
  it('says how many posts lose the tag, and how many leave the library', () => {
    expect(deletionMessage({ posts: 0, leaving: 0 })).toBe('No post carries it.');
    expect(deletionMessage({ posts: 1, leaving: 0 })).toBe(
      'It will be taken off 1 post. No post leaves the library.',
    );
    expect(deletionMessage({ posts: 4, leaving: 1 })).toBe(
      'It will be taken off 4 posts. One of them is in the library only because of this tag, and will leave it.',
    );
    expect(deletionMessage({ posts: 4, leaving: 3 })).toBe(
      'It will be taken off 4 posts. 3 of them are in the library only because of this tag, and will leave it.',
    );
  });
});

describe('renameProblem', () => {
  it('explains every reason a name is refused', () => {
    for (const problem of [
      'empty',
      'too-long',
      'semicolon',
      'control',
      'taken',
      'missing',
    ] as const) {
      expect(renameProblem(problem)).toMatch(/\.$/);
    }
    expect(renameProblem('taken')).toContain('Merge');
  });
});
