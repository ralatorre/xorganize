import { REPLACE_WARNING } from '@/src/library/import-messages';
import { ModalDialog } from './ModalDialog';

/**
 * The preview of a checked file: what it holds, and Merge or Replace. Merge,
 * which keeps everything, has focus first. A file holding part of a library
 * is not offered Replace.
 */
export function ImportDialog(props: {
  lines: readonly string[];
  canReplace: boolean;
  busy: boolean;
  onMerge(): void;
  onReplace(): void;
  onCancel(): void;
}) {
  return (
    <ModalDialog title="Import this backup?" onClose={props.onCancel}>
      <div class="modal__message">
        {props.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        {props.canReplace ? <p>{REPLACE_WARNING}</p> : null}
      </div>
      <div class="modal__buttons">
        <button type="button" class="button" disabled={props.busy} onClick={props.onCancel}>
          Cancel
        </button>
        {props.canReplace ? (
          <button
            type="button"
            class="button button--danger"
            disabled={props.busy}
            onClick={props.onReplace}
          >
            Replace
          </button>
        ) : null}
        <button
          type="button"
          class="button button--primary"
          autofocus
          disabled={props.busy}
          onClick={props.onMerge}
        >
          Merge
        </button>
      </div>
    </ModalDialog>
  );
}
