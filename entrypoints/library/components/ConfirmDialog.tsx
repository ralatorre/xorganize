import { ModalDialog } from './ModalDialog';

/** Asks before something that cannot be undone. Cancel has focus first. */
export function ConfirmDialog(props: {
  title: string;
  message: string;
  confirm: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <ModalDialog title={props.title} onClose={props.onCancel}>
      <p class="modal__message">{props.message}</p>
      <div class="modal__buttons">
        <button type="button" class="button" autofocus onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" class="button button--danger" onClick={props.onConfirm}>
          {props.confirm}
        </button>
      </div>
    </ModalDialog>
  );
}
