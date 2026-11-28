import { useState } from 'preact/hooks';
import { Icon } from './Icon';

/**
 * A tinted bar under the toolbar while a backup is due (DESIGN, 5.6), with a
 * way to make one now or to be reminded later. It goes once a backup is
 * recorded; what happened is said in a toast.
 */
export function BackupReminder(props: {
  message: string;
  onBackUp(): Promise<unknown>;
  onLater(): void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <aside class="reminder" aria-label="Backup reminder">
      <Icon name="backup" />
      <p class="reminder__message">
        <strong>{props.message}</strong> A backup is one file you can restore from.
      </p>
      <button
        type="button"
        class="button button--small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void props.onBackUp().finally(() => setBusy(false));
        }}
      >
        Back up now
      </button>
      <button
        type="button"
        class="button button--small button--quiet"
        disabled={busy}
        onClick={props.onLater}
      >
        Remind me later
      </button>
    </aside>
  );
}
