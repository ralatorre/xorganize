import { describe, expect, it } from 'vitest';
import { X_MATCHES, isSupportedUrl } from '@/src/hosts';

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
