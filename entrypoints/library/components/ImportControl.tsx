import { useRef } from 'preact/hooks';

/**
 * Picks a backup to import. The file goes to `onFile`, which reads and
 * checks it before anything is written; how it went is said in a toast.
 */
export function ImportControl(props: {
  label: string;
  /** The button's classes. Small by default. */
  buttonClass?: string;
  busy: boolean;
  onFile(file: File): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div class="export import">
      <button
        type="button"
        class={props.buttonClass ?? 'button button--small'}
        disabled={props.busy}
        onClick={() => input.current?.click()}
      >
        {props.label}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared, so that picking the same file again is noticed.
          event.currentTarget.value = '';
          if (file) props.onFile(file);
        }}
      />
    </div>
  );
}
