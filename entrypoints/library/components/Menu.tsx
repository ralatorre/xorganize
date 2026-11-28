import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { menuIndex } from '@/src/library/menu';

const ITEMS = '[role="menuitem"], [role="menuitemradio"]';

/**
 * A button and the menu it opens (DESIGN, 7.3). The menu opens under the
 * button; Esc, a click outside or choosing an item closes it, and focus goes
 * back to the button. The arrows, Home and End move between items, and keys
 * pressed in the menu do not reach the library's shortcuts.
 */
export function Menu(props: {
  /** The menu's accessible name, and the button's when its content is not text. */
  label: string;
  buttonClass: string;
  /** What the button shows. */
  button: ComponentChildren;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  /** Menu items: buttons with a menuitem role, and anything that labels them. */
  children: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const items = () => [...(list.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  // On opening, the checked item has focus, or else the first.
  useLayoutEffect(() => {
    if (!open) return;
    const all = items();
    (all.find((item) => item.getAttribute('aria-checked') === 'true') ?? all[0])?.focus();
  }, [open]);

  return (
    <div
      class={`dropdown dropdown--${props.align ?? 'end'}`}
      onFocusOut={(event) => {
        const next = event.relatedTarget;
        if (open && !(next instanceof Node && event.currentTarget.contains(next))) close(false);
      }}
    >
      <button
        ref={button}
        type="button"
        class={props.buttonClass}
        aria-haspopup="menu"
        aria-expanded={open}
        title={props.label}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' || open) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {props.button}
      </button>
      {open ? (
        <>
          <div class="dropdown__scrim" onClick={() => close(false)} />
          <div
            ref={list}
            class="dropdown__menu"
            role="menu"
            aria-label={props.label}
            // Closed before the item acts, so that an item that moves focus,
            // such as into the tag popover, keeps it there.
            onClickCapture={(event) => {
              if (event.target instanceof Element && event.target.closest(ITEMS)) close(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Tab') return;
              event.stopPropagation();
              if (event.key === 'Escape') {
                event.preventDefault();
                close(true);
                return;
              }
              const all = items();
              const at = menuIndex(all.indexOf(event.target as HTMLElement), event.key, all.length);
              if (at === undefined) return;
              event.preventDefault();
              all[at]?.focus();
            }}
          >
            {props.children}
          </div>
        </>
      ) : null}
    </div>
  );
}
