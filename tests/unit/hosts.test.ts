import { describe, expect, it } from 'vitest';
import { X_MATCHES, isSupportedUrl, isXAvatarUrl, xImageUrl } from '@/src/hosts';

describe('X_MATCHES', () => {
  it('covers exactly one host', () => {
    expect(X_MATCHES).toEqual(['https://x.com/*']);
  });
});

describe('isSupportedUrl', () => {
  it.each(['https://x.com/', 'https://x.com/home', 'https://x.com/i/bookmarks'])(
    'accepts %s',
    (url) => {
      expect(isSupportedUrl(url)).toBe(true);
    },
  );

  it.each([
    undefined,
    '',
    'not a url',
    'http://x.com/',
    'https://twitter.com/home',
    'https://evil.example/x.com',
    'https://x.com.evil.example/',
    'https://sub.x.com/',
    'https://notx.com/',
    'chrome-extension://abcdef/library.html',
  ])('rejects %s', (url) => {
    expect(isSupportedUrl(url)).toBe(false);
  });
});

describe('isXAvatarUrl', () => {
  it('accepts a profile picture on X’s image server', () => {
    expect(isXAvatarUrl('https://pbs.twimg.com/profile_images/1/abc_normal.jpg')).toBe(true);
  });

  it.each([
    undefined,
    1,
    '',
    'http://pbs.twimg.com/profile_images/1/abc_normal.jpg',
    'https://pbs.twimg.com:444/profile_images/1/abc_normal.jpg',
    'https://user@pbs.twimg.com/profile_images/1/abc_normal.jpg',
    'https://pbs.twimg.com.example/profile_images/1/abc_normal.jpg',
    'https://pbs.twimg.com/media/abc.jpg',
    'https://pbs.twimg.com/profile_images/1/abc_normal.jpg?x=1',
    'https://pbs.twimg.com/profile_images/1/abc_normal.jpg#x',
    'https://PBS.twimg.com/profile_images/1/abc_normal.jpg',
    `https://pbs.twimg.com/profile_images/${'a'.repeat(2048)}`,
  ])('refuses %j', (value) => {
    expect(isXAvatarUrl(value)).toBe(false);
  });
});

describe('xImageUrl', () => {
  it('keeps avatars as they are', () => {
    const avatar = 'https://pbs.twimg.com/profile_images/1/abc_normal.jpg';
    expect(xImageUrl(avatar)).toBe(avatar);
  });

  it('asks for photos at the small size', () => {
    expect(xImageUrl('https://pbs.twimg.com/media/abc.jpg')).toBe(
      'https://pbs.twimg.com/media/abc.jpg?name=small',
    );
    expect(xImageUrl('https://pbs.twimg.com/media/abc?format=png&name=orig')).toBe(
      'https://pbs.twimg.com/media/abc?format=png&name=small',
    );
  });

  it('keeps video stills as they are', () => {
    const still = 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/abc.jpg';
    expect(xImageUrl(still)).toBe(still);
  });

  it.each([
    undefined,
    '',
    'not a url',
    'http://pbs.twimg.com/media/abc.jpg',
    'https://pbs.twimg.com:8443/media/abc.jpg',
    'https://user:pass@pbs.twimg.com/media/abc.jpg',
    'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
    'https://video.twimg.com/ext_tw_video/1/pu/vid/abc.mp4',
    'https://pbs.twimg.com.evil.example/media/abc.jpg',
    'https://evil.example/pbs.twimg.com/media/abc.jpg',
    'https://media.example/photo1.jpg',
    `https://pbs.twimg.com/${'a'.repeat(2048)}`,
  ])('rejects %s', (url) => {
    expect(xImageUrl(url)).toBeUndefined();
  });
});
