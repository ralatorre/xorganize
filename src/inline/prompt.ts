/**
 * The decisions behind the tag prompt on x.com (DESIGN, 4.3): which of a
 * post's tag buttons it opens the popover from, and when it goes away.
 */

/** How long the prompt shows, while nothing holds it. */
export const PROMPT_MS = 5000;

/** Where an element is on screen, as `getBoundingClientRect` gives it. */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Whether a box is wholly inside a window of the given size. */
export function inView(box: Box, width: number, height: number): boolean {
  return box.top >= 0 && box.left >= 0 && box.bottom <= height && box.right <= width;
}

/**
 * The first item wholly on screen. X keeps posts above and below the window
 * in the page, and a popover opened from one of those would be out of sight.
 * `boxOf` gives undefined for an item no longer in the page.
 */
export function firstInView<Item>(
  items: Iterable<Item>,
  boxOf: (item: Item) => Box | undefined,
  width: number,
  height: number,
): Item | undefined {
  for (const item of items) {
    const box = boxOf(item);
    if (box && inView(box, width, height)) return item;
  }
  return undefined;
}

export interface DismissTimerDependencies {
  /** Runs `task` after `ms`, and returns what cancels it. */
  schedule(task: () => void, ms: number): () => void;
  onExpire(): void;
  ms?: number;
}

/**
 * Counts down to dismissing the prompt, but not while the pointer is over it
 * or focus is in it: someone reaching for its button should not see it go.
 * Once nothing holds it, the count starts again from the full time.
 */
export function createDismissTimer(deps: DismissTimerDependencies) {
  const ms = deps.ms ?? PROMPT_MS;
  const holds = new Set<string>();
  let cancel: (() => void) | undefined;

  const stop = () => {
    cancel?.();
    cancel = undefined;
  };
  const run = () => {
    stop();
    if (holds.size === 0) {
      cancel = deps.schedule(() => {
        cancel = undefined;
        deps.onExpire();
      }, ms);
    }
  };

  return {
    /** Starts the count again, as for a prompt just shown. */
    start(): void {
      holds.clear();
      run();
    },
    /** Pauses the count for a reason, such as 'pointer' or 'focus'. */
    hold(reason: string): void {
      holds.add(reason);
      stop();
    },
    release(reason: string): void {
      if (!holds.delete(reason) || holds.size > 0) return;
      run();
    },
    stop(): void {
      holds.clear();
      stop();
    },
  };
}
