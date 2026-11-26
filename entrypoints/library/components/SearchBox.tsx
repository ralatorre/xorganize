import type { Ref } from 'preact';
import { MAX_QUERY } from '@/src/search/query';

/** The search box. What it accepts is explained by its placeholder (DESIGN, 4.5). */
export function SearchBox(props: {
  query: string;
  onChange(query: string): void;
  inputRef: Ref<HTMLInputElement>;
}) {
  return (
    <div class="search" role="search">
      <input
        ref={props.inputRef}
        class="search__input"
        type="search"
        aria-label="Search posts"
        aria-keyshortcuts="/"
        placeholder="Search posts, @authors, #tags…"
        maxLength={MAX_QUERY}
        spellcheck={false}
        autoComplete="off"
        value={props.query}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  );
}
