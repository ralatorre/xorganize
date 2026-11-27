import { useState } from 'preact/hooks';
import { exportStatus } from '@/src/library/view-export';
import { EXPORT_FORMATS, type ExportFormat } from '@/src/transfer/format';

/**
 * A labelled row of export buttons, one per format, and what the last export
 * did. Used for the view beside Sort and for the whole library in Settings.
 */
export function ExportControl(props: {
  label: string;
  formats: Record<ExportFormat, string>;
  /** Resolves to how many posts were exported, or undefined if it failed. */
  onExport(format: ExportFormat): Promise<number | undefined>;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const run = (format: ExportFormat) => {
    setBusy(true);
    setStatus('');
    void props.onExport(format).then((count) => {
      setBusy(false);
      setStatus(exportStatus(count));
    });
  };

  return (
    <div class="export" role="group" aria-label={props.label}>
      <span class="export__label" aria-hidden="true">
        {props.label}:
      </span>
      {EXPORT_FORMATS.map((format) => (
        <button
          key={format}
          type="button"
          class="button button--small"
          disabled={busy}
          onClick={() => run(format)}
        >
          {props.formats[format]}
        </button>
      ))}
      <span class="export__status" role="status">
        {status}
      </span>
    </div>
  );
}
