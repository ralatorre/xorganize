/**
 * What makes a valid tag name, and when two names are the same tag
 * (docs/DESIGN.md, 4.2).
 */

/** Longest tag name, in characters as a person counts them. */
export const MAX_TAG_NAME = 50;

export type TagNameProblem = 'empty' | 'too-long' | 'semicolon' | 'control';

export type ParsedTagName =
  { ok: true; name: string; nameKey: string } | { ok: false; problem: TagNameProblem };

/**
 * Control, formatting and separator characters, which would let two names
 * look the same. The zero-width joiner is allowed because emoji sequences use it.
 */
const INVISIBLE = /[\p{Cc}\p{Zl}\p{Zp}]|(?!\u200D)\p{Cf}/u;

/**
 * Cleans up a name as typed. Leading and trailing space is removed and runs of
 * space inside become one, so "to  read" and "to read" are the same tag. The
 * display keeps the typed casing.
 */
export function parseTagName(raw: string): ParsedTagName {
  const name = raw.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (name === '') return { ok: false, problem: 'empty' };
  // A semicolon separates tags in CSV exports.
  if (name.includes(';')) return { ok: false, problem: 'semicolon' };
  if (INVISIBLE.test(name)) return { ok: false, problem: 'control' };
  if (Array.from(name).length > MAX_TAG_NAME) return { ok: false, problem: 'too-long' };
  return { ok: true, name, nameKey: tagKey(name) };
}

/** The form used to compare names: NFKC, trimmed, single-spaced, lower-cased. */
export function tagKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}
