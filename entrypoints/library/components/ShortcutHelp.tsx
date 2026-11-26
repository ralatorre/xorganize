import { SHORTCUTS } from '@/src/library/shortcuts';
import { ModalDialog } from './ModalDialog';

/** The library's keyboard shortcuts, as `?` shows them. */
export function ShortcutHelp({ onClose }: { onClose(): void }) {
  return (
    <ModalDialog title="Keyboard shortcuts" onClose={onClose}>
      <dl class="shortcuts">
        {SHORTCUTS.map(({ key, does }) => (
          <div key={key} class="shortcuts__row">
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{does}</dd>
          </div>
        ))}
      </dl>
      <div class="modal__buttons">
        <button type="button" class="button" autofocus onClick={onClose}>
          Close
        </button>
      </div>
    </ModalDialog>
  );
}
