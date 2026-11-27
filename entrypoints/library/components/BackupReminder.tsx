import { useState } from 'preact/hooks';

/**
 * A quiet note that a backup is due, with a way to make one now or to be
 * reminded later. It goes once a backup is recorded.
 */
export function BackupReminder(props: {
  message: string;
  /** Resolves to how many posts were exported, or undefined if it failed. */
  onBackUp(): Promise<number | undefined>;
  onLater(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <aside class="reminder" aria-label="Backup reminder">
      <p class="reminder__message">
        {props.message} {failed ? 'Could not export. Try again.' : null}
      </p>
      <button
        type="button"
        class="button button--small"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void props.onBackUp().then((count) => {
            setBusy(false);
            setFailed(count === undefined);
          });
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
