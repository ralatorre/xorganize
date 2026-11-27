import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, type Theme } from '@/src/dom/theme';

// The tokens as shipped: read from the stylesheet itself, so the check cannot
// drift from what the library shows.
const css = readFileSync(new URL('../../entrypoints/library/tokens.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value!]),
  );
}

const tokensOf = (theme: Theme) => ({
  ...block(':root'),
  ...block(`:root[data-theme='${theme}']`),
});

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`not a hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((at) => {
    const channel = parseInt(match[1]!.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Every text colour, and the backgrounds it is drawn on. */
const TEXT_ON: Record<string, string[]> = {
  text: [
    'bg',
    'surface',
    'raised',
    'field',
    'hover',
    'card-hover',
    'chip',
    'chip-hover',
    'accent-soft',
  ],
  'text-2': ['bg', 'surface', 'raised', 'field', 'hover', 'card-hover', 'chip', 'chip-hover'],
  'accent-ink': ['bg', 'surface', 'raised', 'hover', 'card-hover', 'accent-soft'],
  danger: ['bg', 'surface', 'raised', 'hover', 'danger-soft'],
  'on-accent': ['accent', 'accent-hover'],
  'on-danger': ['danger', 'danger-hover'],
  'notice-text': ['notice-bg'],
  'toast-text': ['toast-bg'],
  'toast-accent': ['toast-bg'],
};

/** Icons are not text, so they need 3:1 (WCAG 1.4.11), not 4.5:1. */
const ICONS_ON = ['bg', 'surface', 'raised', 'field', 'hover', 'card-hover'];

describe.each(THEMES)('the %s theme', (theme) => {
  const tokens = tokensOf(theme);
  const pairs = Object.entries(TEXT_ON).flatMap(([text, backgrounds]) =>
    backgrounds.map((background) => [text, background] as const),
  );

  it.each(pairs)('draws %s on %s at 4.5:1 or more', (text, background) => {
    expect(contrast(tokens[text]!, tokens[background]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ICONS_ON)('draws icons in text-3 on %s at 3:1 or more', (background) => {
    expect(contrast(tokens['text-3']!, tokens[background]!)).toBeGreaterThanOrEqual(3);
  });

  it('defines the same tokens as the other themes', () => {
    expect(Object.keys(block(`:root[data-theme='${theme}']`)).sort()).toEqual(
      Object.keys(block(":root[data-theme='light']")).sort(),
    );
  });
});
