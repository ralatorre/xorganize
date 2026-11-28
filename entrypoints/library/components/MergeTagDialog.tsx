import type { TagId, TagSuggestion } from '@/src/db/types';
import { mergeMessage } from '@/src/library/tag-actions';
import { ModalDialog } from './ModalDialog';
import { Select } from './Select';

/** Which tag to merge this one into. The posts move; this tag goes. */
export function MergeTagDialog(props: {
  tag: TagSuggestion;
  others: readonly TagSuggestion[];
  onMerge(intoId: TagId): void;
  onClose(): void;
}) {
  const { tag, others } = props;
  return (
    <ModalDialog title={`Merge “${tag.name}” into another tag`} onClose={props.onClose}>
      {others.length === 0 ? (
        <>
          <p class="modal__message">There is no other tag to merge into.</p>
          <div class="modal__buttons">
            <button type="button" class="button" autofocus onClick={props.onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const intoId = new FormData(event.currentTarget).get('into');
            if (typeof intoId === 'string' && intoId !== '') props.onMerge(intoId);
          }}
        >
          <label class="modal__label modal__field">
            Merge into
            <Select name="into" class="select--block" autofocus>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
            </Select>
          </label>
          <p class="modal__message">{mergeMessage(tag)}</p>
          <div class="modal__buttons">
            <button type="button" class="button" onClick={props.onClose}>
              Cancel
            </button>
            <button type="submit" class="button button--primary">
              Merge
            </button>
          </div>
        </form>
      )}
    </ModalDialog>
  );
}
