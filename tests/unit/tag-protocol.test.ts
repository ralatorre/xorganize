import { describe, expect, it } from 'vitest';
import { normalisePost } from '@/src/capture/normalise';
import {
  MAX_SUGGESTIONS,
  MAX_TAG_CHANGES,
  MAX_TAG_POSTS,
  isRuntimeMessage,
} from '@/src/messaging/protocol';
import { rawPost } from '../fixtures/posts';

const ACCOUNT = '9000000000000000001';
const set = {
  type: 'tags/set',
  accountId: ACCOUNT,
  postId: '101',
  add: ['rust'],
  remove: ['0b7f5f1e-6a4f-4c39-9a0e-2f5d8c1b9a77'],
};

describe('tag messages', () => {
  it.each([
    ['tags for posts', { type: 'tags/for-posts', accountId: ACCOUNT, postIds: ['1', '2'] }],
    ['a suggestion request', { type: 'tags/suggest', accountId: ACCOUNT, query: 'ru', limit: 5 }],
    ['an empty query', { type: 'tags/suggest', accountId: ACCOUNT, query: '', limit: 1 }],
    ['a tag change', set],
    [
      'a tag change with the post',
      { ...set, post: normalisePost(rawPost({ id: '101' })), partial: true },
    ],
  ])('accepts %s', (_, message) => {
    expect(isRuntimeMessage(message)).toBe(true);
  });

  it.each([
    ['a bad account', { type: 'tags/for-posts', accountId: 'me', postIds: [] }],
    ['a bad post id', { type: 'tags/for-posts', accountId: ACCOUNT, postIds: ['1 OR 1'] }],
    [
      'too many posts',
      { type: 'tags/for-posts', accountId: ACCOUNT, postIds: Array(MAX_TAG_POSTS + 1).fill('1') },
    ],
    ['a zero limit', { type: 'tags/suggest', accountId: ACCOUNT, query: '', limit: 0 }],
    [
      'too large a limit',
      { type: 'tags/suggest', accountId: ACCOUNT, query: '', limit: MAX_SUGGESTIONS + 1 },
    ],
    ['a query that is not text', { type: 'tags/suggest', accountId: ACCOUNT, query: 1, limit: 1 }],
    ['an invalid tag name', { ...set, add: ['a;b'] }],
    ['an empty tag name', { ...set, add: ['  '] }],
    ['a malformed tag id', { ...set, remove: ['<script>'] }],
    ['too many changes', { ...set, add: Array(MAX_TAG_CHANGES + 1).fill('a') }],
    ['the wrong post', { ...set, post: normalisePost(rawPost({ id: '999' })) }],
    ['a malformed post', { ...set, post: { id: '101' } }],
    ['a partial flag that is not a flag', { ...set, partial: 'yes' }],
  ])('rejects %s', (_, message) => {
    expect(isRuntimeMessage(message)).toBe(false);
  });
});
