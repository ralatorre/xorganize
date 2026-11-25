/**
 * Synthetic responses in the shape x.com's GraphQL API is assumed to use.
 * Hand-written: nothing here is copied from real traffic.
 *
 * Every value that would be personal in a real response contains MARKER, so a
 * test can assert that none of it survives into a diagnostics report.
 */

export const MARKER = 'PRIVATE';

export const VIEWER_ID = '9000000000000000001';

function post(id: string, sortIndex: string) {
  return {
    entryId: `tweet-${id}`,
    sortIndex,
    content: {
      entryType: 'TimelineTimelineItem',
      __typename: 'TimelineTimelineItem',
      itemContent: {
        itemType: 'TimelineTweet',
        __typename: 'TimelineTweet',
        tweet_results: {
          result: {
            __typename: 'Tweet',
            rest_id: id,
            core: {
              user_results: {
                result: {
                  __typename: 'User',
                  rest_id: '8000000000000000001',
                  core: { screen_name: `${MARKER}_handle`, name: `${MARKER} Display Name` },
                  avatar: { image_url: `https://media.example/${MARKER}/avatar.jpg` },
                },
              },
            },
            legacy: {
              full_text: `${MARKER} post text with a link https://t.example/${MARKER}`,
              created_at: 'Mon Jan 01 00:00:00 +0000 2024',
              lang: 'en',
              possibly_sensitive: false,
              bookmarked: true,
              favorited: false,
              entities: { urls: [], media: [] },
            },
          },
        },
      },
    },
  };
}

function cursor(kind: 'top' | 'bottom', sortIndex: string) {
  return {
    entryId: `cursor-${kind}-${sortIndex}`,
    sortIndex,
    content: {
      entryType: 'TimelineTimelineCursor',
      __typename: 'TimelineTimelineCursor',
      value: `${MARKER}-cursor-value`,
      cursorType: kind === 'top' ? 'Top' : 'Bottom',
    },
  };
}

const entries = [
  post('1700000000000000003', '1800000000000000003'),
  post('1700000000000000002', '1800000000000000002'),
  post('1700000000000000001', '1800000000000000001'),
  // As on the real site: both cursors come after the posts, top cursor first.
  cursor('top', '1800000000000000004'),
  cursor('bottom', '1800000000000000000'),
];

export const bookmarksResponse = {
  data: {
    bookmark_timeline_v2: {
      timeline: { instructions: [{ type: 'TimelineAddEntries', entries }] },
    },
  },
};

export const likesResponse = {
  data: {
    user: {
      result: {
        __typename: 'User',
        timeline: {
          timeline: { instructions: [{ type: 'TimelineAddEntries', entries }] },
        },
      },
    },
  },
};

export const createBookmarkResponse = { data: { tweet_bookmark_put: 'Done' } };

export const createBookmarkRequest = {
  variables: { tweet_id: '1700000000000000003' },
  queryId: `${MARKER}queryid`,
};
