/** Where the popover goes: below its button, or above when there is no room, and never off screen. */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  side: 'below' | 'above';
}

/** Space kept between the button and the popover, and from the window's edges. */
export const POPOVER_GAP = 8;

/**
 * Which edge of the button the popover lines up with: its end on x.com, the
 * way X's own menus sit, and its start in the library, so that it opens over
 * the list rather than the sidebar (DESIGN, 4.5).
 */
export type PopoverAlign = 'start' | 'end';

export function placePopover(
  anchor: Rect,
  popover: { width: number; height: number },
  viewport: { width: number; height: number },
  { align = 'end', gap = POPOVER_GAP }: { align?: PopoverAlign; gap?: number } = {},
): Placement {
  const below = anchor.top + anchor.height + gap;
  const above = anchor.top - gap - popover.height;
  const fitsBelow = below + popover.height <= viewport.height - gap;
  const side = fitsBelow || above < gap ? 'below' : 'above';

  // Lined up with one edge of the button, then shifted inside the window.
  const preferred = align === 'start' ? anchor.left : anchor.left + anchor.width - popover.width;
  const left = Math.min(
    Math.max(preferred, gap),
    Math.max(gap, viewport.width - popover.width - gap),
  );
  const top =
    side === 'below'
      ? Math.min(below, Math.max(gap, viewport.height - popover.height - gap))
      : above;
  return { top, left, side };
}
