/**
 * The library's toasts (DESIGN, 4.5): every result is reported in one place.
 * Only one shows at a time, and a new one replaces it. Each closes itself
 * after TOAST_MS, or with its close button.
 */

/** How long a toast shows before it closes itself. */
export const TOAST_MS = 5000;

export interface ToastAction {
  label: string;
  run(): void;
}

export interface Toast {
  /** Tells this toast from the one it replaced, so that a late timer closes only its own. */
  id: number;
  message: string;
  action?: ToastAction;
}

export interface ToastState {
  shown?: Toast;
  next: number;
}

export const NO_TOAST: ToastState = { next: 1 };

export type ToastEvent =
  | { type: 'show'; message: string; action?: ToastAction }
  /** Closes the toast with this ID, if it is still the one shown. */
  | { type: 'close'; id: number };

export function changeToast(state: ToastState, event: ToastEvent): ToastState {
  if (event.type === 'show') {
    const shown: Toast = { id: state.next, message: event.message };
    return {
      shown: event.action ? { ...shown, action: event.action } : shown,
      next: state.next + 1,
    };
  }
  return state.shown?.id === event.id ? { next: state.next } : state;
}
