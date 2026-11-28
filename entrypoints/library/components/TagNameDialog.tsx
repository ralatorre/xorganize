import { useState } from 'preact/hooks';
import { MAX_TAG_NAME } from '@/src/tags/names';
import { ModalDialog } from './ModalDialog';

/**
 * Asks for a tag's name, for a new tag or a rename. `onSave` resolves to why
 * the name was refused, which is shown under it, or to nothing once saved.
 */
export function TagNameDialog(props: {
  title: string;
  name?: string;
  save: string;
  onSave(name: string): Promise<string | undefined>;
  onClose(): void;
}) {
  const [problem, setProblem] = useState<string>();
  return (
    <ModalDialog title={props.title} onClose={props.onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const name = new FormData(event.currentTarget).get('name');
          void props.onSave(typeof name === 'string' ? name : '').then((refused) => {
            if (refused === undefined) props.onClose();
            else setProblem(refused);
          });
        }}
      >
        <label class="modal__label modal__field">
          Name
          <input
            name="name"
            type="text"
            class="input"
            defaultValue={props.name ?? ''}
            maxLength={MAX_TAG_NAME * 2}
            autocomplete="off"
            spellcheck={false}
            autofocus
            onFocus={(event) => event.currentTarget.select()}
            aria-invalid={problem !== undefined}
            aria-describedby={problem ? 'tag-name-problem' : undefined}
          />
        </label>
        {problem ? (
          <p id="tag-name-problem" class="modal__problem" role="alert">
            {problem}
          </p>
        ) : null}
        <div class="modal__buttons">
          <button type="button" class="button" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" class="button button--primary">
            {props.save}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
