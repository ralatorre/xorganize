import { describe, expect, it } from 'vitest';
import { isTheme, themeOfColour } from '@/src/dom/theme';
import { createThemeReport } from '@/src/inline/theme-report';
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

describe('createThemeReport', () => {
  it('reports the first theme read, and then only changes', () => {
    const sent: string[] = [];
    const report = createThemeReport((theme) => sent.push(theme));
    report('light');
    report('light');
    report('dark');
    report('dark');
    report('light');
    expect(sent).toEqual(['light', 'dark', 'light']);
  });
});
