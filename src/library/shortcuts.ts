/**
 * The library's keyboard shortcuts (DESIGN, 4.5). Decided from the key event
 * alone, so that they can be tested without a page.
 */

export const SEARCH_KEY = '/';

export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Where the key was pressed. */
  target: { tagName?: string; isContentEditable?: boolean } | null;
}

const TYPING_IN = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** True while the key goes into a field, where it must type rather than act. */
export function isTyping(target: KeyPress['target']): boolean {
  if (!target) return false;
  return target.isContentEditable === true || TYPING_IN.has(target.tagName ?? '');
}

/** `/` on its own, outside a field, moves focus to the search box. */
export function isSearchShortcut(press: KeyPress): boolean {
  return (
    press.key === SEARCH_KEY &&
    !press.ctrlKey &&
    !press.metaKey &&
    !press.altKey &&
    !isTyping(press.target)
  );
}
