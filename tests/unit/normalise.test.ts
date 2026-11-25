import { describe, expect, it } from 'vitest';
import { isCapturedPost, normalisePost } from '@/src/capture/normalise';
import { link, photo, rawPost, video } from '../fixtures/posts';

const ID = '1700000000000000001';

describe('normalisePost', () => {
  it('reads a plain post', () => {
    expect(normalisePost(rawPost({ id: ID, bookmarked: true }))).toEqual({
      id: ID,
      url: `https://x.com/example_user/status/${ID}`,
      text: 'Lorem ipsum dolor sit amet.',
      createdAt: Date.UTC(2024, 0, 1, 12),
      lang: 'en',
      author: {
        id: '8000000000000000001',
        handle: 'example_user',
        name: 'Example User',
        avatarUrl: 'https://media.example/avatar.jpg',
      },
      media: [],
      links: [],
      sensitive: false,
      bookmarked: true,
      liked: false,
    });
  });

  it('reads through the visibility wrapper', () => {
    expect(normalisePost(rawPost({ id: ID, wrapped: true }))?.id).toBe(ID);
  });

  it('still reads the author from the older location', () => {
    expect(normalisePost(rawPost({ id: ID, legacyAuthor: true }))?.author).toEqual({
      id: '8000000000000000001',
      handle: 'example_user',
      name: 'Example User',
      avatarUrl: 'https://media.example/legacy-avatar.jpg',
    });
  });

  it('prefers long-form text', () => {
    const post = normalisePost(rawPost({ id: ID, text: 'Short…', note: 'The whole long text.' }));

    expect(post?.text).toBe('The whole long text.');
  });

  it('replaces shortened links, drops the media link, and unescapes the text', () => {
    const post = normalisePost(
      rawPost({
        id: ID,
        text: 'Tom &amp; Jerry &lt;3 https://t.example/link1 https://t.example/media1',
        urls: [link(1)],
        media: [photo(1)],
      }),
    );

    expect(post?.text).toBe('Tom & Jerry <3 https://site.example/article/1');
    expect(post?.links).toEqual([
      { url: 'https://site.example/article/1', display: 'site.example/article/1' },
    ]);
  });

  it('does not unescape twice', () => {
    expect(normalisePost(rawPost({ id: ID, text: '&amp;lt;b&amp;gt;' }))?.text).toBe('&lt;b&gt;');
  });

  it('reads photos, and the best video file with its still image', () => {
    const post = normalisePost(rawPost({ id: ID, media: [photo(1), video()] }));

    expect(post?.media).toEqual([
      { kind: 'photo', url: 'https://media.example/photo1.jpg', alt: 'Alt text 1' },
      {
        kind: 'video',
        url: 'https://media.example/video1-high.mp4',
        previewUrl: 'https://media.example/video1-still.jpg',
      },
    ]);
  });

  it('records the quoted post, wrapped or not', () => {
    const quoted = rawPost({ id: '1700000000000000009', wrapped: true });

    expect(normalisePost(rawPost({ id: ID, quoted }))?.quotedId).toBe('1700000000000000009');
  });

  it('keeps only https URLs', () => {
    const post = normalisePost(
      rawPost({
        id: ID,
        urls: [
          {
            url: 'https://t.example/a',
            expanded_url: 'http://insecure.example/',
            display_url: 'a',
          },
          { url: 'https://t.example/b', expanded_url: 'javascript:alert(1)', display_url: 'b' },
          { url: 'https://t.example/c', expanded_url: 'not a url', display_url: 'c' },
        ],
        media: [{ type: 'photo', media_url_https: 'data:text/html,<script>' }],
      }),
    );

    expect(post?.links).toEqual([]);
    expect(post?.media).toEqual([]);
  });

  it('caps what it keeps', () => {
    const post = normalisePost(
      rawPost({
        id: ID,
        name: 'N'.repeat(500),
        text: 'x'.repeat(100_000),
        media: Array.from({ length: 50 }, (_, n) => photo(n)),
      }),
    );

    expect(post?.text).toHaveLength(30_000);
    expect(post?.author.name).toHaveLength(100);
    expect(post?.media).toHaveLength(10);
  });

  it('has no date when the API gives an unreadable one', () => {
    expect(normalisePost(rawPost({ id: ID, createdAt: 'whenever' }))?.createdAt).toBeNull();
  });

  it.each([
    ['nothing', undefined],
    ['a string', 'post'],
    ['no id', { ...rawPost({ id: ID }), rest_id: undefined }],
    ['a non-numeric id', rawPost({ id: 'abc' })],
    ['an id that is a number', { ...rawPost({ id: ID }), rest_id: 17 }],
    ['no author', { ...rawPost({ id: ID }), core: {} }],
    ['a handle with other characters', rawPost({ id: ID, handle: 'bad handle/../' })],
    ['an unavailable post', { __typename: 'TweetUnavailable', reason: 'Suspended' }],
  ])('rejects %s', (_label, raw) => {
    expect(normalisePost(raw)).toBeUndefined();
  });
});

describe('isCapturedPost', () => {
  const valid = normalisePost(rawPost({ id: ID, media: [photo(), video()], urls: [link()] }))!;

  it('accepts what normalisePost produces', () => {
    expect(isCapturedPost(valid)).toBe(true);
    expect(isCapturedPost(normalisePost(rawPost({ id: ID, legacyAuthor: true })))).toBe(true);
  });

  it.each([
    ['a non-numeric id', { id: '12ab' }],
    ['a URL that does not match the id and handle', { url: 'https://evil.example/' }],
    ['overlong text', { text: 'x'.repeat(30_001) }],
    ['a non-finite date', { createdAt: Infinity }],
    ['a handle with other characters', { author: { ...valid.author, handle: '<script>' } }],
    ['a non-https avatar', { author: { ...valid.author, avatarUrl: 'javascript:alert(1)' } }],
    ['an unknown media kind', { media: [{ kind: 'exe', url: 'https://media.example/a' }] }],
    ['a non-https media URL', { media: [{ kind: 'photo', url: 'http://media.example/a' }] }],
    ['too many media', { media: Array.from({ length: 11 }, () => valid.media[0]) }],
    ['a non-https link', { links: [{ url: 'file:///etc/passwd', display: 'x' }] }],
    ['a non-boolean flag', { bookmarked: 'yes' }],
    ['a non-numeric quoted id', { quotedId: 'abc' }],
  ])('rejects %s', (_label, change) => {
    expect(isCapturedPost({ ...valid, ...change })).toBe(false);
  });

  it.each([null, undefined, 'post', 42, []])('rejects %j', (value) => {
    expect(isCapturedPost(value)).toBe(false);
  });
});
