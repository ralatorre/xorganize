import { describe, expect, it } from 'vitest';
import {
  describeKeys,
  describeShape,
  entryIdPattern,
  timelineStats,
} from '@/src/diagnostics/shape';
import { MARKER, bookmarksResponse } from '../fixtures/timeline';

describe('describeShape', () => {
  it('records key paths and types', () => {
    const { paths } = describeShape({ a: 1, b: { c: 'x', d: null }, e: [true, { f: 2 }], g: [] });

    expect(paths).toEqual({
      '.a': ['number'],
      '.b.c': ['string'],
      '.b.d': ['null'],
      '.e': ['array'],
      '.e[]': ['boolean'],
      '.e[].f': ['number'],
      '.g': ['array(empty)'],
    });
  });

  it('never records values, apart from identifier-like values of schema keys', () => {
    const summary = describeShape(bookmarksResponse);
    const text = JSON.stringify(summary);

    expect(text).not.toContain(MARKER);
    expect(text).not.toMatch(/\d{10,}/); // no ids
    expect(summary.enums['.data.bookmark_timeline_v2.timeline.instructions[].type']).toEqual([
      'TimelineAddEntries',
    ]);
    expect(
      summary.paths[
        '.data.bookmark_timeline_v2.timeline.instructions[].entries[].content.itemContent.tweet_results.result.legacy.full_text'
      ],
    ).toEqual(['string']);
  });

  it('does not record a schema key whose value is not an identifier', () => {
    const { enums } = describeShape({
      type: 'some free text',
      __typename: `${MARKER} name`,
      itemType: '12345',
      displayType: 'x'.repeat(60),
    });

    expect(enums).toEqual({});
  });

  it('replaces keys that could carry data with a placeholder', () => {
    const { paths } = describeShape({ '12345': 1, 'a b': 2, 'https://x.example': 3, ok_key: 4 });

    expect(Object.keys(paths).sort()).toEqual(['.<key>', '.ok_key']);
  });

  it('stops at its limits and says so', () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) wide[`key_${i}`] = i;

    const summary = describeShape(wide);

    expect(summary.truncated).toBe(true);
    expect(Object.keys(summary.paths)).toHaveLength(4000);
  });

  it('survives deep nesting', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 200; i++) deep = { n: deep };

    expect(describeShape(deep).truncated).toBe(true);
  });
});

describe('describeKeys', () => {
  it('returns paths only', () => {
    expect(describeKeys({ variables: { tweet_id: '123' }, queryId: 'abc' })).toEqual([
      '.queryId',
      '.variables.tweet_id',
    ]);
  });
});

describe('timelineStats', () => {
  it('counts entries and posts and checks the order', () => {
    expect(timelineStats(bookmarksResponse)).toEqual({
      entries: 5,
      entryIdPatterns: ['cursor-bottom-<n>', 'cursor-top-<n>', 'tweet-<n>'],
      tweetResults: 3,
      postEntries: 3,
      postSortIndexDescending: true,
      sortIndexIsPostId: 0,
      bookmarked: { yes: 3, no: 0 },
      favorited: { yes: 0, no: 3 },
    });
  });

  const postEntry = (id: string, sortIndex: string, wrapped = false) => {
    const post = { rest_id: id, legacy: {} };
    const result = wrapped ? { __typename: 'TweetWithVisibilityResults', tweet: post } : post;
    return {
      entryId: `tweet-${id}`,
      sortIndex,
      content: { itemContent: { tweet_results: { result } } },
    };
  };
  const cursorEntry = (sortIndex: string) => ({ entryId: `cursor-top-${sortIndex}`, sortIndex });

  it('judges order by post entries only, ignoring cursors', () => {
    const stats = timelineStats([postEntry('1', '30'), postEntry('2', '20'), cursorEntry('99')]);

    expect(stats.postSortIndexDescending).toBe(true);
    expect(stats.postEntries).toBe(2);
    expect(stats.entries).toBe(3);
  });

  it('reports ascending order as not descending', () => {
    const stats = timelineStats([postEntry('1', '20'), postEntry('2', '30')]);

    expect(stats.postSortIndexDescending).toBe(false);
  });

  it('has no opinion on order with fewer than two post entries', () => {
    expect(timelineStats([postEntry('1', '20'), cursorEntry('5')]).postSortIndexDescending).toBe(
      null,
    );
    expect(timelineStats({}).postSortIndexDescending).toBeNull();
  });

  it('notices when the sort index is the post id, through a visibility wrapper too', () => {
    const stats = timelineStats([postEntry('30', '30'), postEntry('20', '20', true)]);

    expect(stats.sortIndexIsPostId).toBe(2);
    expect(stats.tweetResults).toBe(2);
  });
});

describe('entryIdPattern', () => {
  it.each([
    ['tweet-1700000000000000001', 'tweet-<n>'],
    ['cursor-bottom-1800000000000000000', 'cursor-bottom-<n>'],
    ['promoted-tweet-123-abcdef', 'promoted-tweet-<n>-<word>'],
    ['who-to-follow-123', 'who-to-follow-<n>'],
    ['profile-conversation-1-tweet-2', 'profile-conversation-<n>-tweet-<n>'],
    [`user-${MARKER}_handle`, 'user-<word>'],
    ['Some Free Text', '<word>'],
  ])('reduces %s to %s', (entryId, pattern) => {
    expect(entryIdPattern(entryId)).toBe(pattern);
  });
});
