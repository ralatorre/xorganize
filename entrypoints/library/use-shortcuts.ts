import { useEffect, useRef } from 'preact/hooks';
import { shortcutOf, type Shortcut } from '@/src/library/shortcuts';

/** What each shortcut does. A handler that returns false leaves the key alone. */
export type ShortcutHandlers = Partial<Record<Shortcut, () => boolean | void>>;

/**
 * Listens for the library's shortcuts anywhere on the page. Keys typed into
 * the tag popover never arrive here: the keyboard guard hands them to the
 * popover alone.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const current = useRef(handlers);
  current.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const shortcut = shortcutOf({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target,
        inDialog: Boolean(target?.closest('dialog')),
      });
      const handler = shortcut && current.current[shortcut];
      if (!handler || handler() === false) return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
