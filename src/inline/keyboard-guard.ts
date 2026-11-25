/**
 * Keeps what the user types into the extension's controls away from the page.
 *
 * Key, input and clipboard events are composed: they leave a shadow root and
 * travel through the page, retargeted to the shadow host. Without this, the
 * page could read every tag name typed, and X's own single-key shortcuts
 * would fire while typing. So a capture listener on the window, added before
 * any page script runs, stops those events when they are aimed at one of the
 * extension's hosts and hands them to that host's handler instead. Stopping
 * propagation does not prevent the default action, so typing still types.
 */

/** Events that carry what the user typed, pasted or composed. */
export const GUARDED_EVENTS = [
  'keydown',
  'keyup',
  'keypress',
  'beforeinput',
  'input',
  'textInput',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'paste',
  'copy',
  'cut',
] as const;

export type GuardHandler = (event: Event) => void;

export interface KeyboardGuard {
  /** Events aimed at `host` go to `handler` and nowhere else. */
  protect(host: EventTarget, handler?: GuardHandler): void;
  release(host: EventTarget): void;
}

export function createKeyboardGuard(target: EventTarget): KeyboardGuard {
  const handlers = new WeakMap<EventTarget, GuardHandler | undefined>();
  const guard = (event: Event) => {
    const host = event.target;
    if (!host || !handlers.has(host)) return;
    event.stopImmediatePropagation();
    handlers.get(host)?.(event);
  };
  for (const type of GUARDED_EVENTS) target.addEventListener(type, guard, true);

  return {
    protect: (host, handler) => void handlers.set(host, handler),
    release: (host) => void handlers.delete(host),
  };
}

/** Pointer and focus events that a host stops at itself, so the page never acts on them. */
export const CONTAINED_EVENTS = [
  'click',
  'auxclick',
  'dblclick',
  'contextmenu',
  'mousedown',
  'mouseup',
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
] as const;

/**
 * Stops pointer events at the host as they bubble out, so that a click on the
 * extension's button does not also open the post underneath it.
 */
export function contain(host: EventTarget): void {
  const stop = (event: Event) => event.stopPropagation();
  for (const type of CONTAINED_EVENTS) host.addEventListener(type, stop);
}
