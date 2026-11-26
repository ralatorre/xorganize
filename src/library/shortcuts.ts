/**
 * The library's keyboard shortcuts (DESIGN, 4.5). Decided from the key event
 * alone, so that they can be tested without a page.
 */

export type Shortcut = 'search' | 'next' | 'previous' | 'tag' | 'open' | 'help';

/** Each shortcut's key, and what the shortcut list says it does, in the order it lists them. */
export const SHORTCUTS: ReadonlyArray<{ key: string; shortcut: Shortcut; does: string }> = [
  { key: '/', shortcut: 'search', does: 'Search' },
  { key: 'j', shortcut: 'next', does: 'Next post' },
  { key: 'k', shortcut: 'previous', does: 'Previous post' },
  { key: 't', shortcut: 'tag', does: 'Tag the post' },
  { key: 'o', shortcut: 'open', does: 'Open the post on X' },
  { key: '?', shortcut: 'help', does: 'Show these shortcuts' },
];

const BY_KEY = new Map(SHORTCUTS.map(({ key, shortcut }) => [key, shortcut]));

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Where the key was pressed. */
  target: { tagName?: string; isContentEditable?: boolean } | null;
  /** A dialog is open, such as a confirmation: keys belong to it. */
  inDialog?: boolean;
}

const TYPING_IN = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True while the key goes into a field, where it must type rather than act. */
export function isTyping(target: KeyPress['target']): boolean {
  if (!target) return false;
  return target.isContentEditable === true || TYPING_IN.has(target.tagName ?? '');
}

/**
 * The shortcut a key press means, if any: a single key, with no Ctrl, Cmd or
 * Alt, pressed outside a field and outside a dialog. Shift is allowed, since
 * some layouts need it for `/` and `?`; letters are matched as typed, so
 * Shift+J is not `j`.
 */
export function shortcutOf(press: KeyPress): Shortcut | undefined {
  if (press.ctrlKey || press.metaKey || press.altKey) return undefined;
  if (press.inDialog === true || isTyping(press.target)) return undefined;
  return BY_KEY.get(press.key);
}

/**
 * The post `j` or `k` moves to: the next or previous one, stopping at either
 * end. With no post focused, the first one on screen.
 */
export function stepTo(
  current: number | undefined,
  delta: 1 | -1,
  count: number,
  firstOnScreen: number,
): number | undefined {
  if (count === 0) return undefined;
  if (current === undefined) return Math.min(Math.max(firstOnScreen, 0), count - 1);
  return Math.min(Math.max(current + delta, 0), count - 1);
}
