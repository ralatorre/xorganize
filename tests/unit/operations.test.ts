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

describe('anyOperationFromUrl, for endpoints that are not GraphQL', () => {
  it.each([
    ['https://x.com/i/api/1.1/favorites/create.json', 'Rest_favorites_create'],
    ['https://x.com/i/api/2/notifications/all.json?count=20', 'Rest_notifications_all'],
    ['https://api.x.com/1.1/jot/client_event.json', 'Rest_jot_client_event'],
    ['https://x.com/i/api/2/guide.json', 'Rest_guide'],
    ['https://x.com/i/api/fleets/v1/avatar_content', 'Rest'],
  ])('names %s as %s', (text, name) => {
    expect(anyOperationFromUrl(url(text))).toBe(name);
  });

  it.each([
    ['an id in the file name', 'https://x.com/i/api/1.1/dm/conversation/123-456.json'],
    ['a mixed-case segment', 'https://x.com/i/api/1.1/users/SomeHandle/thing'],
    ['a handle-like final segment', 'https://x.com/i/api/1.1/users/some_handle'],
  ])('never includes %s in a name', (_label, text) => {
    expect(anyOperationFromUrl(url(text))).toBe('Rest');
  });

  it('keeps a route word but not an id or mixed-case parent', () => {
    expect(anyOperationFromUrl(url('https://x.com/i/api/1.1/12345/show.json'))).toBe('Rest_show');
    expect(anyOperationFromUrl(url('https://x.com/i/api/1.1/SomeHandle/show.json'))).toBe(
      'Rest_show',
    );
  });

  it('ignores requests that are not to the API', () => {
    expect(anyOperationFromUrl(url('https://x.com/home'))).toBeUndefined();
    expect(anyOperationFromUrl(url('https://x.com/manifest.json'))).toBeUndefined();
    expect(anyOperationFromUrl(url('https://example.com/i/api/1.1/a/b.json'))).toBeUndefined();
  });
});
