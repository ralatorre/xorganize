import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { placePopover } from '@/src/inline/position';
import { MENU_GAP, menuIndex } from '@/src/library/menu';

const ITEMS = '[role="menuitem"], [role="menuitemradio"]';

/**
 * A button and the menu it opens (DESIGN, 7.3). The menu opens under the
 * button; Esc, a click outside or choosing an item closes it, and focus goes
 * back to the button. The arrows, Home and End move between items, and keys
 * pressed in the menu do not reach the library's shortcuts.
 *
 * It keeps whether it is open, unless `open` and `onOpenChange` are given, as
 * when a right click elsewhere opens it.
 */
export function Menu(props: {
  /** The menu's accessible name, and the button's tooltip. */
  label: string;
  /** The button's accessible name, when its content does not say enough. */
  buttonLabel?: string;
  buttonClass: string;
  /** What the button shows. */
  button: ComponentChildren;
  /** Which edge of the button the menu lines up with. */
  align?: 'start' | 'end';
  /** Focus the first item on opening, even when another is checked. */
  focusFirst?: boolean;
  /**
   * Placed over the page at the button, below it or above when there is no
   * room, instead of inside its container. For a menu inside an area that
   * scrolls, such as the sidebar, which would cut it off. Scrolling closes it.
   */
  floating?: boolean;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  /** Menu items: buttons with a menuitem role, and anything that labels them. */
  children: ComponentChildren;
}) {
  const [own, setOwn] = useState(false);
  const open = props.open ?? own;
  const setOpen = props.onOpenChange ?? setOwn;
  const { floating } = props;
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
    if (floating && list.current && button.current)
      place(list.current, button.current, props.align ?? 'end');
    const all = items();
    const checked = props.focusFirst
      ? undefined
      : all.find((item) => item.getAttribute('aria-checked') === 'true');
    // Moving focus must not scroll, which would close a floating menu.
    (checked ?? all[0])?.focus({ preventScroll: floating === true });
  }, [open]);

  // A floating menu stays where it was placed, so it closes once the button moves.
  useEffect(() => {
    if (!open || !floating) return;
    const closeOnMove = () => close(false);
    window.addEventListener('scroll', closeOnMove, { capture: true, passive: true });
    window.addEventListener('resize', closeOnMove);
    return () => {
      window.removeEventListener('scroll', closeOnMove, { capture: true });
      window.removeEventListener('resize', closeOnMove);
    };
  }, [open, floating]);

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
        aria-label={props.buttonLabel}
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
            class={floating ? 'dropdown__menu dropdown__menu--floating' : 'dropdown__menu'}
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

/** Puts a floating menu at its button, inside the window. */
function place(menu: HTMLElement, from: HTMLElement, align: 'start' | 'end') {
  const { top, left } = placePopover(
    from.getBoundingClientRect(),
    { width: menu.offsetWidth, height: menu.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
    { align, gap: MENU_GAP },
  );
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}
