import type { Toast } from '@/src/library/toast';
import { Icon } from './Icon';

/**
 * The one place results are reported, at the bottom centre (DESIGN, 4.5).
 * The region is always there, so that screen readers announce what appears
 * in it.
 */
export function Toasts(props: { shown: Toast | undefined; onClose(id: number): void }) {
  const { shown } = props;
  return (
    <div class="toasts" role="status">
      {shown ? (
        <div key={shown.id} class="toast">
          <span class="toast__message">{shown.message}</span>
          {shown.action ? (
            <button
              type="button"
              class="toast__action"
              onClick={() => {
                shown.action?.run();
                props.onClose(shown.id);
              }}
            >
              {shown.action.label}
            </button>
          ) : null}
          <button
            type="button"
            class="toast__close"
            aria-label="Dismiss"
            onClick={() => props.onClose(shown.id)}
          >
            <Icon name="close" size="small" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
