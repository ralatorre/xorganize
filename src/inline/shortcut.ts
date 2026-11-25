/** The keyboard shortcut that opens the tag popover (DESIGN, 4.2). */

export interface Shortcut {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/** Alt+T: clear of X's own single-key shortcuts. Matched by key position, so any layout works. */
export const TAG_SHORTCUT: Shortcut = {
  code: 'KeyT',
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

export function matchesShortcut(event: Shortcut, shortcut: Shortcut = TAG_SHORTCUT): boolean {
  return (
    event.code === shortcut.code &&
    event.altKey === shortcut.altKey &&
    event.ctrlKey === shortcut.ctrlKey &&
    event.metaKey === shortcut.metaKey &&
    event.shiftKey === shortcut.shiftKey
  );
}
