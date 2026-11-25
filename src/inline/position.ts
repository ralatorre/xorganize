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

export function placePopover(
  anchor: Rect,
  popover: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = POPOVER_GAP,
): Placement {
  const below = anchor.top + anchor.height + gap;
  const above = anchor.top - gap - popover.height;
  const fitsBelow = below + popover.height <= viewport.height - gap;
  const side = fitsBelow || above < gap ? 'below' : 'above';

  // Right-aligned with the button, the way X's own menus sit, then shifted inside the window.
  const preferred = anchor.left + anchor.width - popover.width;
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
