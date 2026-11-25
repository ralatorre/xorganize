import { describe, expect, it } from 'vitest';
import { viewerIdFromCookie } from '@/src/capture/account';

describe('viewerIdFromCookie', () => {
  it.each([
    ['twid=u%3D12345', '12345'],
    ['a=1; twid=u%3D12345; b=2', '12345'],
    ['a=1;twid=u%3D12345', '12345'],
    ['twid="u=12345"', '12345'],
    ['twid=u=12345; other=x', '12345'],
  ])('reads the id from %s', (cookie, id) => {
    expect(viewerIdFromCookie(cookie)).toBe(id);
  });

  it.each([
    '',
    'other=1',
    'nottwid=u%3D12345',
    'twid=u%3Dabc',
    'twid=u%3D',
    'twid=u%3D12345extra',
    `twid=u%3D${'9'.repeat(30)}`,
  ])('finds nothing in %s', (cookie) => {
    expect(viewerIdFromCookie(cookie)).toBeUndefined();
  });
});
