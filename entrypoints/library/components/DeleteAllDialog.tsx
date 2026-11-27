import { useState } from 'preact/hooks';
import { DELETE_ALL_MESSAGE, DELETE_WORD, confirmsDeletion } from '@/src/library/delete-all';
import { ModalDialog } from './ModalDialog';

/** Asks for a word to be typed before the whole library is deleted. Cancel has focus first. */
export function DeleteAllDialog(props: { onDelete(): void; onCancel(): void }) {
  const [typed, setTyped] = useState('');
  const confirmed = confirmsDeletion(typed);
  return (
    <ModalDialog title="Delete all data?" onClose={props.onCancel}>
      <p class="modal__message">{DELETE_ALL_MESSAGE}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (confirmed) props.onDelete();
        }}
      >
        <label class="manage__label modal__field">
          Type “{DELETE_WORD}” to confirm
          <input
            type="text"
            class="input"
            value={typed}
            autocomplete="off"
            spellcheck={false}
            onInput={(event) => setTyped(event.currentTarget.value)}
          />
        </label>
        <div class="modal__buttons">
          <button type="button" class="button" autofocus onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" class="button button--danger" disabled={!confirmed}>
            Delete all data
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
