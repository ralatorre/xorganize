import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { RenameResult } from '@/src/db/tags';
import { renameProblem } from '@/src/library/tag-actions';
import { MAX_TAG_NAME } from '@/src/tags/names';

/** A new name for a tag. Says why when the name cannot be used. */
export function RenameTagForm(props: {
  name: string;
  onRename(name: string): Promise<RenameResult>;
  onDone(): void;
}) {
  const [problem, setProblem] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => input.current?.select(), []);

  return (
    <form
      class="manage__form"
      onSubmit={(event) => {
        event.preventDefault();
        void props.onRename(input.current?.value ?? '').then((result) => {
          if (result.ok) props.onDone();
          else setProblem(renameProblem(result.problem));
        });
      }}
    >
      <label class="manage__label">
        New name
        <input
          ref={input}
          type="text"
          class="manage__input"
          defaultValue={props.name}
          maxLength={MAX_TAG_NAME * 2}
          autocomplete="off"
          spellcheck={false}
          aria-invalid={problem !== undefined}
          aria-describedby={problem ? 'rename-problem' : undefined}
        />
      </label>
      {problem ? (
        <p id="rename-problem" class="manage__problem" role="alert">
          {problem}
        </p>
      ) : null}
      <div class="manage__buttons">
        <button type="submit">Save</button>
        <button type="button" onClick={props.onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
