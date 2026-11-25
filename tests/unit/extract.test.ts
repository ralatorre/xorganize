import { describe, expect, it } from 'vitest';
import { extractPosts } from '@/src/capture/extract';
import { SeenPosts } from '@/src/capture/seen';
import { normalisePost } from '@/src/capture/normalise';
import {
  bookmarksTimeline,
  cursorEntry,
  homeTimeline,
  likesTimeline,
  moduleEntry,
  postEntry,
  promotedEntry,
  rawPost,
  unavailableEntry,
} from '../fixtures/posts';

const ids = (posts: Array<{ id: string }>) => posts.map((post) => post.id);

describe('extractPosts', () => {
  it('returns the timeline’s own posts in order, with their sort indexes', () => {
    const { entries, nested, unavailable } = extractPosts(
      bookmarksTimeline([
        postEntry(rawPost({ id: '103' }), '9003'),
        postEntry(rawPost({ id: '102', wrapped: true }), '9002'),
        postEntry(rawPost({ id: '101' }), '9001'),
        cursorEntry('top', '9004'),
        cursorEntry('bottom', '9000'),
      ]),
    );

    expect(entries.map((entry) => [entry.post.id, entry.sortIndex])).toEqual([
      ['103', '9003'],
      ['102', '9002'],
      ['101', '9001'],
    ]);
    expect(nested).toEqual([]);
    expect(unavailable).toEqual([]);
  });

  it('finds the same posts whatever the outer structure is', () => {
    const entries = [postEntry(rawPost({ id: '101' }), '9001')];

    for (const body of [
      bookmarksTimeline(entries),
      likesTimeline(entries),
      homeTimeline(entries),
      { something: { entirely: [{ different: entries }] } },
    ]) {
      expect(ids(extractPosts(body).entries.map((entry) => entry.post))).toEqual(['101']);
    }
  });

  it('lists quoted and reposted posts as nested, not as entries', () => {
    const quoted = rawPost({ id: '201' });
    const original = rawPost({ id: '202' });
    const { entries, nested } = extractPosts(
      homeTimeline([
        postEntry(rawPost({ id: '101', quoted }), '9002'),
        postEntry(rawPost({ id: '102', reposted: original }), '9001'),
      ]),
    );

    expect(ids(entries.map((entry) => entry.post))).toEqual(['101', '102']);
    expect(ids(nested).sort()).toEqual(['201', '202']);
    expect(entries[0]?.post.quotedId).toBe('201');
  });

  it('lists posts inside a grouped entry as nested', () => {
    const { entries, nested } = extractPosts(
      homeTimeline([moduleEntry([rawPost({ id: '301' }), rawPost({ id: '302' })], '9001')]),
    );

    expect(entries).toEqual([]);
    expect(ids(nested)).toEqual(['301', '302']);
  });

  it('skips promoted posts, and anything nested in them', () => {
    const { entries, nested } = extractPosts(
      homeTimeline([
        promotedEntry(rawPost({ id: '401', quoted: rawPost({ id: '402' }) }), '9002'),
        postEntry(rawPost({ id: '101' }), '9001'),
      ]),
    );

    expect(ids(entries.map((entry) => entry.post))).toEqual(['101']);
    expect(nested).toEqual([]);
  });

  it('reports entries whose post is no longer available, by the id in the entry', () => {
    const { entries, unavailable } = extractPosts(
      bookmarksTimeline([
        unavailableEntry('501', '9002'),
        postEntry(rawPost({ id: '101' }), '9001'),
      ]),
    );

    expect(ids(entries.map((entry) => entry.post))).toEqual(['101']);
    expect(unavailable).toEqual(['501']);
  });

  it('does not list a post twice', () => {
    const post = rawPost({ id: '101' });
    const { entries, nested } = extractPosts(
      bookmarksTimeline([
        postEntry(post, '9002'),
        postEntry(rawPost({ id: '102', quoted: post }), '9001'),
      ]),
    );

    expect(ids(entries.map((entry) => entry.post))).toEqual(['101', '102']);
    expect(nested).toEqual([]);
  });

  it('ignores an entry whose sort index is not a number', () => {
    const { entries, nested } = extractPosts(
      bookmarksTimeline([postEntry(rawPost({ id: '101' }), 'not-a-number')]),
    );

    expect(entries).toEqual([]);
    expect(ids(nested)).toEqual(['101']);
  });

  it.each([null, undefined, 'text', 42, [], {}, { data: null }, { errors: [{ message: 'x' }] }])(
    'finds nothing in %j',
    (body) => {
      expect(extractPosts(body)).toEqual({ entries: [], nested: [], unavailable: [] });
    },
  );

  it('survives a very deep response', () => {
    let deep: unknown = postEntry(rawPost({ id: '101' }), '9001');
    for (let i = 0; i < 500; i++) deep = { wrap: deep };

    expect(extractPosts(deep)).toEqual({ entries: [], nested: [], unavailable: [] });
  });
});

describe('SeenPosts', () => {
  const post = (id: string) => normalisePost(rawPost({ id }))!;

  it('returns what was added', () => {
    const seen = new SeenPosts();
    seen.add(post('1'));

    expect(seen.get('1')?.id).toBe('1');
    expect(seen.get('2')).toBeUndefined();
  });

  it('forgets the oldest post beyond its limit', () => {
    const seen = new SeenPosts(2);
    seen.add(post('1'));
    seen.add(post('2'));
    seen.add(post('3'));

    expect(seen.size).toBe(2);
    expect(seen.get('1')).toBeUndefined();
    expect(seen.get('3')?.id).toBe('3');
  });

  it('treats a post seen again as new', () => {
    const seen = new SeenPosts(2);
    seen.add(post('1'));
    seen.add(post('2'));
    seen.add(post('1'));
    seen.add(post('3'));

    expect(seen.get('1')?.id).toBe('1');
    expect(seen.get('2')).toBeUndefined();
  });
});
