/** The keyboard shortcut that opens the tag popover (DESIGN, 4.2). */

import type { PopoverAnchor } from '@/src/ui/popover';

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

/**
 * True for the shortcut going down. Events the keyboard guard hands to a
 * host's handler are of every guarded type, so the type is checked too.
 */
export function isShortcutPress(event: Event): boolean {
  return event.type === 'keydown' && matchesShortcut(event as unknown as Shortcut);
}

/**
 * The anchor for the shortcut pressed on a post: placed at the post's tag
 * button, but giving focus back to the post on close, so that X's `j` and `k`
 * carry on from it. Focus on the button would keep keys from X.
 */
export function postAnchor(button: PopoverAnchor, post: HTMLElement): PopoverAnchor {
  return {
    postId: button.postId,
    host: button.host,
    button: post,
    setExpanded: (expanded) => button.setExpanded(expanded),
  };
}
