import { useEffect, useReducer } from 'preact/hooks';
import {
  NO_TOAST,
  TOAST_MS,
  changeToast,
  type ToastAction,
  type ToastState,
} from '@/src/library/toast';

export interface ToastControl {
  state: ToastState;
  show(message: string, action?: ToastAction): void;
  close(id: number): void;
}

/** The page's toast: shown on request, closed after TOAST_MS or when asked. */
export function useToasts(): ToastControl {
  const [state, change] = useReducer(changeToast, NO_TOAST);
  const id = state.shown?.id;
  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => change({ type: 'close', id }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [id]);
  return {
    state,
    show: (message, action) =>
      change(action ? { type: 'show', message, action } : { type: 'show', message }),
    close: (closing) => change({ type: 'close', id: closing }),
  };
}
