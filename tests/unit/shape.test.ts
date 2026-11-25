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
      entries: 4,
      entryIdPatterns: ['cursor-bottom-<n>', 'tweet-<n>'],
      sortIndexDescending: true,
      tweetResults: 3,
    });
  });

  it('reports ascending order as not descending', () => {
    const stats = timelineStats([
      { entryId: 'tweet-1', sortIndex: '1' },
      { entryId: 'tweet-2', sortIndex: '2' },
    ]);

    expect(stats.sortIndexDescending).toBe(false);
  });

  it('has no opinion on order with fewer than two entries', () => {
    expect(timelineStats({ entryId: 'tweet-1', sortIndex: '1' }).sortIndexDescending).toBeNull();
    expect(timelineStats({}).sortIndexDescending).toBeNull();
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
