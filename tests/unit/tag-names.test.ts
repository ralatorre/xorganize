import { describe, expect, it } from 'vitest';
import { MAX_TAG_NAME, parseTagName, tagKey } from '@/src/tags/names';
import { TAG_COLOURS, nextColour } from '@/src/tags/palette';

describe('parseTagName', () => {
  it.each([
    ['rust', 'rust', 'rust'],
    ['  To  Read ', 'To Read', 'to read'],
    ['dev/rust', 'dev/rust', 'dev/rust'],
    ['ＴＳ', 'TS', 'ts'], // full-width letters fold to ordinary ones
    ['👨‍👩‍👧 family', '👨‍👩‍👧 family', '👨‍👩‍👧 family'],
  ])('accepts %j as %j', (raw, name, nameKey) => {
    expect(parseTagName(raw)).toEqual({ ok: true, name, nameKey });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['a;b', 'semicolon'],
    [`a${String.fromCodePoint(0)}b`, 'control'],
    [`a${String.fromCodePoint(0x200b)}b`, 'control'], // zero-width space
    [`a${String.fromCodePoint(0x202e)}b`, 'control'], // right-to-left override
    ['x'.repeat(MAX_TAG_NAME + 1), 'too-long'],
  ])('rejects %j', (raw, problem) => {
    expect(parseTagName(raw)).toEqual({ ok: false, problem });
  });

  it('counts length as a person would', () => {
    expect(parseTagName('😀'.repeat(MAX_TAG_NAME)).ok).toBe(true);
  });
});

describe('tagKey', () => {
  it('treats names that differ only in case and spacing as one', () => {
    expect(tagKey(' To  Read')).toBe(tagKey('to read'));
  });
});

describe('nextColour', () => {
  it('takes the lowest unused colour', () => {
    expect(nextColour([])).toBe(0);
    expect(nextColour([0, 1, 3])).toBe(2);
  });

  it('takes the least used once all are in use', () => {
    const all = Array.from({ length: TAG_COLOURS }, (_, index) => index);
    expect(nextColour([...all, 0, 1])).toBe(2);
  });

  it('ignores colours outside the palette', () => {
    expect(nextColour([-1, 99, 0.5])).toBe(0);
  });
});
