import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

/**
 * A modal dialog, open while it is rendered. Esc and the close buttons inside
 * call `onClose`. The browser keeps focus inside, and puts it back where it
 * was when the dialog closes.
 */
export function ModalDialog(props: {
  title: string;
  onClose(): void;
  children: ComponentChildren;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      class="modal"
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        props.onClose();
      }}
    >
      <h2 id="modal-title" class="modal__title">
        {props.title}
      </h2>
      {props.children}
    </dialog>
  );
}
