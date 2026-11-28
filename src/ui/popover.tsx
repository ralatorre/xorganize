/**
 * The tag popover (DESIGN, 4.2): one per page, opened from a tag button on
 * x.com or a card's [+] in the library.
 *
 * Key and input events never reach the popover through the page: the
 * keyboard guard stops them on the window and hands them to the popover
 * (src/inline/keyboard-guard.ts). On x.com that keeps typing from the site;
 * in the library it keeps typing from the library's own shortcuts. Clicks
 * inside reach it normally and are stopped at its host on the way out.
 */

import { render } from 'preact';
import type { Theme } from '@/src/dom/theme';
import { contain, type KeyboardGuard } from '@/src/inline/keyboard-guard';
import type { Suggestions } from '@/src/inline/popover-model';
import type { PopoverAlign } from '@/src/inline/position';
import type { TagState } from '@/src/inline/tag-state';
import type { TagEdit } from '@/src/inline/tagger';
import { createShadowHost } from './shadow';
import { popoverStyles, type PopoverLook } from './styles';
import { TagPopover, type GuardedHandler } from './TagPopover';

/** What the popover opens from: a post's tag button. */
export interface PopoverAnchor {
  postId: string;
  /** The element the popover is placed against. Clicks on it do not close the popover. */
  host: HTMLElement;
  /** Where focus returns on close. */
  button: HTMLElement;
  setExpanded(expanded: boolean): void;
}

/** An anchor for a plain button, which shows whether the popover is open for it. */
export function buttonAnchor(postId: string, button: HTMLElement): PopoverAnchor {
  return {
    postId,
    host: button,
    button,
    setExpanded: (expanded) => button.setAttribute('aria-expanded', expanded ? 'true' : 'false'),
  };
}

export interface PopoverDependencies {
  /** The window the popover is shown in: its document, size, events and timers. */
  view: Window;
  state: TagState;
  change(postId: string, edit: TagEdit): Promise<boolean>;
  suggest(query: string): Promise<Suggestions | undefined>;
  theme(): Theme;
  guard: KeyboardGuard;
  /** Where the popover's host is attached while open. */
  mountPoint(): Element;
  /** Which edge of its button it lines up with. The end by default, as on x.com. */
  align?: PopoverAlign;
  /** Whose look it takes: X's on x.com, the library's in the library (DESIGN, 7.4). */
  look?: PopoverLook;
  suggestDelayMs?: number;
}

export interface Popover {
  /** Opens for the anchor's post, or closes if already open for it. */
  toggle(anchor: PopoverAnchor): void;
  close(returnFocus: boolean): void;
}

export function createPopover(deps: PopoverDependencies): Popover {
  const { view } = deps;
  const { host, container } = createShadowHost(view.document, popoverStyles(deps.look ?? 'x'));
  contain(host);
  let onGuarded: GuardedHandler | undefined;
  deps.guard.protect(host, (event) => onGuarded?.(event));

  let anchor: PopoverAnchor | undefined;
  let reposition: (() => void) | undefined;

  const onOutside = (event: Event) => {
    if (event.target !== host && event.target !== anchor?.host) close(false);
  };
  const onMove = () => {
    if (!anchor?.host.isConnected) close(false);
    else reposition?.();
  };

  function close(returnFocus: boolean) {
    const closing = anchor;
    if (!closing) return;
    anchor = undefined;
    onGuarded = undefined;
    reposition = undefined;
    render(null, container);
    host.remove(); // tag names are in the page's DOM only while the popover is open
    view.removeEventListener('pointerdown', onOutside, true);
    view.removeEventListener('focusin', onOutside, true);
    view.removeEventListener('scroll', onMove, true);
    view.removeEventListener('resize', onMove);
    closing.setExpanded(false);
    if (returnFocus) closing.button.focus({ preventScroll: true });
  }

  function open(next: PopoverAnchor) {
    anchor = next;
    container.dataset.theme = deps.theme();
    deps.mountPoint().append(host);
    render(
      <TagPopover
        postId={next.postId}
        anchor={next.host}
        deps={deps}
        onClose={close}
        handleGuarded={(handler) => (onGuarded = handler)}
        handleReposition={(handler) => (reposition = handler)}
      />,
      container,
    );
    next.setExpanded(true);
    view.addEventListener('pointerdown', onOutside, true);
    view.addEventListener('focusin', onOutside, true);
    view.addEventListener('scroll', onMove, { capture: true, passive: true });
    view.addEventListener('resize', onMove, { passive: true });
  }

  return {
    toggle(next) {
      const same = anchor?.host === next.host && anchor.postId === next.postId;
      close(false);
      if (!same) open(next);
    },
    close,
  };
}
