import { useRef, useState } from 'preact/hooks';

/** The card's ⋯ menu: copy the link to the post, or take it out of the library. */
export function PostMenu(props: { onCopyLink(): Promise<boolean>; onRemove(): void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<boolean>();
  const toggle = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  return (
    <div
      class="menu"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        close();
      }}
    >
      <button
        ref={toggle}
        type="button"
        class="menu__toggle"
        aria-label="More actions"
        aria-expanded={open}
        onClick={() => {
          setCopied(undefined);
          setOpen(!open);
        }}
      >
        ⋯
      </button>
      {open ? (
        <span class="menu__items" role="group" aria-label="Post actions">
          <button
            type="button"
            class="menu__item"
            onClick={() => void props.onCopyLink().then(setCopied)}
          >
            Copy link
          </button>
          <button
            type="button"
            class="menu__item"
            onClick={() => {
              setOpen(false);
              props.onRemove();
            }}
          >
            Remove from library
          </button>
        </span>
      ) : null}
      <span role="status" class="menu__status">
        {copied === undefined ? '' : copied ? 'Link copied' : 'Could not copy the link'}
      </span>
    </div>
  );
}
