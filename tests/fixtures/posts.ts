/**
 * Builders for synthetic posts and timelines, in the shape confirmed against
 * real traffic (spec, 18.1). Hand-written: nothing is copied from a real
 * response, and every name, handle and URL is a placeholder.
 */

export interface RawPostOptions {
  id: string;
  handle?: string;
  name?: string;
  text?: string;
  /** Long-form text, as on posts over the usual length. */
  note?: string;
  createdAt?: string;
  media?: unknown[];
  urls?: unknown[];
  quoted?: unknown;
  reposted?: unknown;
  bookmarked?: boolean;
  favorited?: boolean;
  sensitive?: boolean;
  /** Wrap in the visibility wrapper the API uses for some posts. */
  wrapped?: boolean;
  /** Put the author's handle and name where the API used to keep them. */
  legacyAuthor?: boolean;
  avatarUrl?: string;
}

export function rawPost(options: RawPostOptions): Record<string, unknown> {
  const handle = options.handle ?? 'example_user';
  const name = options.name ?? 'Example User';
  const post = {
    __typename: 'Tweet',
    rest_id: options.id,
    core: {
      user_results: {
        result: {
          __typename: 'User',
          rest_id: '8000000000000000001',
          ...(options.legacyAuthor
            ? {
                legacy: {
                  screen_name: handle,
                  name,
                  profile_image_url_https: 'https://media.example/legacy-avatar.jpg',
                },
              }
            : {
                core: { screen_name: handle, name },
                avatar: { image_url: options.avatarUrl ?? 'https://media.example/avatar.jpg' },
              }),
        },
      },
    },
    ...(options.note === undefined
      ? {}
      : {
          note_tweet: {
            note_tweet_results: { result: { text: options.note, entity_set: { urls: [] } } },
          },
        }),
    ...(options.quoted === undefined ? {} : { quoted_status_result: { result: options.quoted } }),
    legacy: {
      full_text: options.text ?? 'Lorem ipsum dolor sit amet.',
      created_at: options.createdAt ?? 'Mon Jan 01 12:00:00 +0000 2024',
      lang: 'en',
      possibly_sensitive: options.sensitive ?? false,
      bookmarked: options.bookmarked ?? false,
      favorited: options.favorited ?? false,
      entities: { urls: options.urls ?? [], ...(options.media ? { media: options.media } : {}) },
      ...(options.media ? { extended_entities: { media: options.media } } : {}),
      ...(options.reposted === undefined
        ? {}
        : { retweeted_status_result: { result: options.reposted } }),
    },
  };
  return options.wrapped ? { __typename: 'TweetWithVisibilityResults', tweet: post } : post;
}

export const photo = (n = 1) => ({
  type: 'photo',
  url: `https://t.example/media${n}`,
  media_url_https: `https://media.example/photo${n}.jpg`,
  ext_alt_text: `Alt text ${n}`,
});

export const video = () => ({
  type: 'video',
  url: 'https://t.example/video1',
  media_url_https: 'https://media.example/video1-still.jpg',
  video_info: {
    variants: [
      { content_type: 'application/x-mpegURL', url: 'https://media.example/video1.m3u8' },
      { content_type: 'video/mp4', bitrate: 256000, url: 'https://media.example/video1-low.mp4' },
      { content_type: 'video/mp4', bitrate: 2176000, url: 'https://media.example/video1-high.mp4' },
    ],
  },
});

export const link = (n = 1) => ({
  url: `https://t.example/link${n}`,
  expanded_url: `https://site.example/article/${n}`,
  display_url: `site.example/article/${n}`,
});

export function postEntry(post: unknown, sortIndex: string, id?: string) {
  const postId = id ?? (post as { rest_id?: string; tweet?: { rest_id: string } }).rest_id;
  return {
    entryId: `tweet-${postId ?? (post as { tweet: { rest_id: string } }).tweet.rest_id}`,
    sortIndex,
    content: {
      entryType: 'TimelineTimelineItem',
      __typename: 'TimelineTimelineItem',
      itemContent: {
        itemType: 'TimelineTweet',
        __typename: 'TimelineTweet',
        tweet_results: { result: post },
      },
    },
  };
}

export function promotedEntry(post: unknown, sortIndex: string) {
  const entry = postEntry(post, sortIndex);
  return { ...entry, entryId: `promoted-tweet-${sortIndex}-abcdef` };
}

export function unavailableEntry(id: string, sortIndex: string) {
  return postEntry({ __typename: 'TweetUnavailable', reason: 'Suspended' }, sortIndex, id);
}

/** A grouped entry, as the home timeline uses for conversations. */
export function moduleEntry(posts: unknown[], sortIndex: string) {
  return {
    entryId: `home-conversation-${sortIndex}`,
    sortIndex,
    content: {
      entryType: 'TimelineTimelineModule',
      __typename: 'TimelineTimelineModule',
      items: posts.map((post, index) => ({
        entryId: `home-conversation-${sortIndex}-tweet-${index}`,
        item: { itemContent: { itemType: 'TimelineTweet', tweet_results: { result: post } } },
      })),
    },
  };
}

export function cursorEntry(kind: 'top' | 'bottom', sortIndex: string) {
  return {
    entryId: `cursor-${kind}-${sortIndex}`,
    sortIndex,
    content: {
      entryType: 'TimelineTimelineCursor',
      __typename: 'TimelineTimelineCursor',
      value: 'cursor-value',
      cursorType: kind === 'top' ? 'Top' : 'Bottom',
    },
  };
}

const instructions = (entries: unknown[]) => [{ type: 'TimelineAddEntries', entries }];

export const bookmarksTimeline = (entries: unknown[]) => ({
  data: { bookmark_timeline_v2: { timeline: { instructions: instructions(entries) } } },
});

export const likesTimeline = (entries: unknown[]) => ({
  data: {
    user: {
      result: {
        __typename: 'User',
        timeline: { timeline: { instructions: instructions(entries) } },
      },
    },
  },
});

export const homeTimeline = (entries: unknown[]) => ({
  data: { home: { home_timeline_urt: { instructions: instructions(entries) } } },
});
