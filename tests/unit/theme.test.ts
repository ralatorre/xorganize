import { describe, expect, it } from 'vitest';
import { isTheme, themeOfColour } from '@/src/dom/theme';
import { createChangeReport } from '@/src/inline/change-report';
import { avatarOfImage, avatarSelector, handleOfProfileLink } from '@/src/dom/viewer-profile';
import { themeFor } from '@/src/library/theme';

describe('themeFor', () => {
  it('matches the theme last seen on x.com', () => {
    expect(themeFor('x', 'dim', false)).toBe('dim');
    expect(themeFor('x', 'light', true)).toBe('light');
  });

  it('follows the system for Match X until x.com has been seen', () => {
    expect(themeFor('x', undefined, true)).toBe('dark');
    expect(themeFor('x', undefined, false)).toBe('light');
  });

  it('follows the system for System, whatever x.com shows', () => {
    expect(themeFor('system', 'dim', true)).toBe('dark');
    expect(themeFor('system', 'dim', false)).toBe('light');
  });

  it.each(['light', 'dim', 'dark'] as const)('keeps %s whatever else is true', (theme) => {
    expect(themeFor(theme, 'dim', true)).toBe(theme);
    expect(themeFor(theme, undefined, false)).toBe(theme);
  });
});

describe('isTheme', () => {
  it('accepts X’s three themes and nothing else', () => {
    expect(['light', 'dim', 'dark'].every(isTheme)).toBe(true);
    expect([undefined, 'x', 'system', 'Light', 0].some(isTheme)).toBe(false);
  });

  it('agrees with what is read from the page', () => {
    expect(isTheme(themeOfColour('rgb(21, 32, 43)'))).toBe(true);
  });
});

describe('createChangeReport', () => {
  it('reports the first theme read, and then only changes', () => {
    const sent: string[] = [];
    const report = createChangeReport<string>((theme) => sent.push(theme));
    report('light');
    report('light');
    report('dark');
    report('dark');
    report('light');
    expect(sent).toEqual(['light', 'dark', 'light']);
  });

  it('compares values by their key', () => {
    const sent: string[] = [];
    const report = createChangeReport<{ accountId: string; handle: string }>(
      ({ handle }) => sent.push(handle),
      ({ accountId, handle }) => `${accountId} ${handle}`,
    );
    report({ accountId: '1', handle: 'first' });
    report({ accountId: '1', handle: 'first' });
    report({ accountId: '1', handle: 'renamed' });
    report({ accountId: '2', handle: 'renamed' });
    expect(sent).toEqual(['first', 'renamed', 'renamed']);
  });
});

describe('handleOfProfileLink', () => {
  it('reads the handle from the link to the account’s profile', () => {
    expect(handleOfProfileLink('/some_one')).toBe('some_one');
  });

  it.each([
    null,
    undefined,
    '',
    '/',
    'some_one',
    '/some_one/likes',
    '/some one',
    '/home?x=1',
    'https://x.com/some_one',
    `/${'a'.repeat(21)}`,
  ])('gives nothing for %j', (href) => {
    expect(handleOfProfileLink(href)).toBeUndefined();
  });
});

describe('the account’s picture', () => {
  it('is looked for in the avatar of the same handle', () => {
    expect(avatarSelector('some_one')).toBe('[data-testid="UserAvatar-Container-some_one"] img');
  });

  it('is taken only from X’s image server', () => {
    expect(avatarOfImage('https://pbs.twimg.com/profile_images/1/abc_normal.jpg')).toBe(
      'https://pbs.twimg.com/profile_images/1/abc_normal.jpg',
    );
    expect(avatarOfImage('https://example.com/a.jpg')).toBeUndefined();
    expect(avatarOfImage(null)).toBeUndefined();
    expect(avatarOfImage(undefined)).toBeUndefined();
  });
});
