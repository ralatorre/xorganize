import type { Virtualizer } from '@tanstack/virtual-core';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { stepTo } from '@/src/library/shortcuts';

/** What the library's shortcuts can do in the list. */
export interface PostNavigation {
  /** Moves focus to the next or previous card, bringing it into view. */
  move(delta: 1 | -1): void;
  /** Uses the focused card's control: its [+] or its Open on X link. False if no card has focus. */
  act(action: 'tag' | 'open'): boolean;
}

/**
 * Keyboard focus in the virtualised list. A card that is not rendered yet is
 * scrolled to first, and focused once it is.
 */
export function usePostNavigation(
  list: { readonly current: HTMLElement | null },
  virtualizer: Virtualizer<Window, HTMLElement>,
  count: number,
): PostNavigation {
  const pending = useRef<number | undefined>(undefined);

  const card = (index: number) =>
    list.current?.querySelector<HTMLElement>(`[data-index="${index}"] article.post`) ?? null;
  const focus = (index: number): boolean => {
    const element = card(index);
    if (!element) return false;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ block: 'nearest' });
    return true;
  };
  const focused = (): Element | null => {
    const active = list.current?.ownerDocument.activeElement;
    return active && list.current?.contains(active) ? active : null;
  };

  useLayoutEffect(() => {
    if (pending.current !== undefined && focus(pending.current)) pending.current = undefined;
  });

  return {
    move(delta) {
      const row = focused()?.closest('[data-index]');
      const scrolled = list.current?.ownerDocument.defaultView?.scrollY ?? 0;
      const firstOnScreen = virtualizer.getVirtualItems().find((item) => item.end > scrolled);
      const target = stepTo(
        row ? Number(row.getAttribute('data-index')) : undefined,
        delta,
        count,
        firstOnScreen?.index ?? 0,
      );
      if (target === undefined || focus(target)) return;
      pending.current = target;
      virtualizer.scrollToIndex(target, { align: 'center' });
    },
    act(action) {
      const control = focused()
        ?.closest('article.post')
        ?.querySelector<HTMLElement>(`[data-action="${action}"]`);
      control?.click();
      return control !== undefined && control !== null;
    },
  };
}
