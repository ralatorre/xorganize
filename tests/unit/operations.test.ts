import { describe, expect, it } from 'vitest';
import {
  anyOperationFromUrl,
  isKnownOperation,
  knownOperationFromUrl,
} from '@/src/capture/operations';

const url = (text: string) => new URL(text);

describe('isKnownOperation', () => {
  it.each(['Bookmarks', 'Likes', 'CreateBookmark', 'UnfavoriteTweet', 'HomeTimeline'])(
    'knows %s',
    (op) => {
      expect(isKnownOperation(op)).toBe(true);
    },
  );

  it.each(['', 'bookmarks', 'DMInbox', 'constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not know %s',
    (op) => {
      expect(isKnownOperation(op)).toBe(false);
    },
  );
});

describe('knownOperationFromUrl', () => {
  it('reads the operation from an x.com GraphQL URL', () => {
    expect(knownOperationFromUrl(url('https://x.com/i/api/graphql/AbC-12_x/Bookmarks?v=1'))).toBe(
      'Bookmarks',
    );
  });

  it.each([
    'https://x.com/i/api/graphql/abc/DMInbox',
    'https://x.com/i/api/graphql/abc/Bookmarks/extra',
    'https://x.com/i/api/1.1/Bookmarks',
    'https://x.com/other/i/api/graphql/abc/Bookmarks',
    'http://x.com/i/api/graphql/abc/Bookmarks',
    'https://api.x.com/i/api/graphql/abc/Bookmarks',
    'https://x.com.evil.example/i/api/graphql/abc/Bookmarks',
    'https://evil.example/i/api/graphql/abc/Bookmarks',
  ])('ignores %s', (text) => {
    expect(knownOperationFromUrl(url(text))).toBeUndefined();
  });
});

describe('anyOperationFromUrl', () => {
  it('reads any operation from any host', () => {
    expect(anyOperationFromUrl(url('https://api.example/graphql/abc/DMInbox'))).toBe('DMInbox');
    expect(anyOperationFromUrl(url('https://x.com/i/api/graphql/abc/Bookmarks'))).toBe('Bookmarks');
  });

  it('ignores URLs that are not GraphQL operations', () => {
    expect(anyOperationFromUrl(url('https://x.com/home'))).toBeUndefined();
    expect(anyOperationFromUrl(url('https://x.com/graphql/abc/has space'))).toBeUndefined();
  });
});
