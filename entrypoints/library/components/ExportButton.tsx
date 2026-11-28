import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { exportStatus } from '@/src/library/view-export';

/** A button that exports, and what the last export did. */
export function ExportButton(props: {
  class: string;
  /** Resolves to how many posts were exported, or undefined if it failed. */
  onExport(): Promise<number | undefined>;
  children: ComponentChildren;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  return (
    <>
      <span class="export__status" role="status">
        {status}
      </span>
      <button
        type="button"
        class={props.class}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setStatus('');
          void props.onExport().then((count) => {
            setBusy(false);
            setStatus(exportStatus(count));
          });
        }}
      >
        {props.children}
      </button>
    </>
  );
}
