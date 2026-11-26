import {
  Virtualizer,
  observeWindowOffset,
  observeWindowRect,
  windowScroll,
  type VirtualizerOptions,
} from '@tanstack/virtual-core';
import { useLayoutEffect, useReducer, useState } from 'preact/hooks';

export interface WindowListOptions {
  count: number;
  estimateSize(index: number): number;
  getItemKey(index: number): string | number;
  overscan: number;
}

/**
 * A virtualiser for a list that scrolls with the page: only rows near the
 * viewport are rendered. `list` is the list element, whose distance from the
 * top of the page is kept up to date as what sits above it changes.
 */
export function useWindowVirtualizer(
  list: { readonly current: HTMLElement | null },
  options: WindowListOptions,
): Virtualizer<Window, HTMLElement> {
  const [, rerender] = useReducer((renders: number) => renders + 1, 0);
  const [margin, setMargin] = useState(0);
  const resolved: VirtualizerOptions<Window, HTMLElement> = {
    ...options,
    getScrollElement: () => window,
    observeElementRect: observeWindowRect,
    observeElementOffset: observeWindowOffset,
    scrollToFn: windowScroll,
    initialOffset: () => window.scrollY,
    scrollMargin: margin,
    onChange: () => rerender(undefined),
  };
  const [virtualizer] = useState(() => new Virtualizer<Window, HTMLElement>(resolved));
  virtualizer.setOptions(resolved);

  useLayoutEffect(() => virtualizer._didMount(), [virtualizer]);
  useLayoutEffect(() => {
    virtualizer._willUpdate();
    const top = list.current ? list.current.getBoundingClientRect().top + window.scrollY : 0;
    if (Math.abs(top - margin) >= 1) setMargin(top);
  });
  return virtualizer;
}
