import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';
import { isSearchShortcut } from '@/src/library/shortcuts';

/** Focuses the search box when `/` is pressed anywhere on the page outside a field. */
export function useSearchShortcut(input: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!isSearchShortcut({ ...pick(event), target }) || !input.current) return;
      event.preventDefault();
      input.current.focus();
      input.current.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [input]);
}

const pick = ({ key, ctrlKey, metaKey, altKey }: KeyboardEvent) => ({
  key,
  ctrlKey,
  metaKey,
  altKey,
});
