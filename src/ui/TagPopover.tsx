import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { TagSummary } from '@/src/db/types';
import {
  keyAction,
  moveHighlight,
  nameOf,
  recentOf,
  rowsOf,
  type Suggestions,
} from '@/src/inline/popover-model';
import { placePopover } from '@/src/inline/position';
import type { TagEdit } from '@/src/inline/tagger';
import { MAX_TAG_NAME } from '@/src/tags/names';
import type { PopoverDependencies } from './popover';
import { PopoverRow } from './PopoverRow';
import { TagDot } from './TagDot';

/** How long typing must pause before suggestions are asked for. */
export const SUGGEST_DELAY_MS = 80;

export type GuardedHandler = (event: Event) => void;

/** What the popover shows: the post's tags, a field to add more, and suggestions. */
export function TagPopover(props: {
  postId: string;
  anchor: HTMLElement;
  deps: PopoverDependencies;
  onClose(returnFocus: boolean): void;
  handleGuarded(handler: GuardedHandler): void;
  handleReposition(handler: () => void): void;
}) {
  const { postId, deps } = props;
  const { view } = deps;
  const [applied, setApplied] = useState<TagSummary[]>(() => deps.state.get(postId) ?? []);
  const [query, setQuery] = useState('');
  /** Suggestions, and the text they were found for. */
  const [found, setFound] = useState<Suggestions & { query: string | undefined }>({
    suggestions: [],
    recent: [],
    query: undefined,
  });
  const [highlight, setHighlight] = useState(-1);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => deps.state.watch(postId, setApplied), [deps.state, postId]);
  useLayoutEffect(() => input.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    let live = true;
    const timer = view.setTimeout(
      () => {
        void deps.suggest(query).then((next) => {
          if (live && next) setFound({ ...next, query });
        });
      },
      query === '' ? 0 : (deps.suggestDelayMs ?? SUGGEST_DELAY_MS),
    );
    return () => {
      live = false;
      view.clearTimeout(timer);
    };
  }, [deps, view, query]);

  const rows = query.trim() === '' ? [] : rowsOf(query, found.suggestions, applied);
  const recent = query.trim() === '' ? recentOf(found.recent, applied) : [];
  useEffect(() => setHighlight(rows.length > 0 ? 0 : -1), [query, rows.length]);

  const position = () => {
    const element = dialog.current;
    if (!element) return;
    const place = placePopover(
      props.anchor.getBoundingClientRect(),
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: view.innerWidth, height: view.innerHeight },
      { align: deps.align ?? 'end' },
    );
    element.style.top = `${place.top}px`;
    element.style.left = `${place.left}px`;
  };
  useLayoutEffect(position);
  props.handleReposition(position);

  const save = (edit: TagEdit) => {
    void deps.change(postId, edit).then((ok) => setFailed(!ok));
  };
  const apply = (name: string) => {
    if (input.current) input.current.value = '';
    setQuery('');
    save({ add: [name] });
  };
  const remove = (tag: TagSummary) => save({ remove: [tag.id] });
  // Enter pressed before suggestions for the typed text arrived: an existing
  // tag must win over creating a new one from a few letters (DESIGN, 5.2).
  const applyBestMatch = (typed: string) => {
    void deps.suggest(typed).then((next) => {
      const best = rowsOf(typed, next?.suggestions ?? [], applied)[0];
      if (best) apply(nameOf(best));
    });
  };

  props.handleGuarded((event) => {
    if (event.type === 'input') {
      setQuery(input.current?.value ?? '');
      return;
    }
    if (event.type !== 'keydown') return;
    const action = keyAction((event as KeyboardEvent).key, {
      query,
      rows,
      highlight,
      appliedCount: applied.length,
    });
    if (action.type === 'none') return;
    event.preventDefault();
    if (action.type === 'close') props.onClose(true);
    else if (action.type === 'move')
      setHighlight(moveHighlight(highlight, action.delta, rows.length));
    else if (action.type === 'apply' && found.query !== query) applyBestMatch(query);
    else if (action.type === 'apply') apply(nameOf(action.row));
    else if (action.type === 'remove-last') remove(applied[applied.length - 1]!);
  });

  const optionId = (index: number) => `xorganize-option-${index}`;

  return (
    <div class="dialog" role="dialog" aria-label="Tags for this post" ref={dialog}>
      <div class="field">
        {applied.map((tag) => (
          <span class="chip" key={tag.id}>
            <TagDot colour={tag.color} />
            <span>{tag.name}</span>
            <button
              type="button"
              aria-label={`Remove tag ${tag.name}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => remove(tag)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Add a tag"
          aria-autocomplete="list"
          aria-expanded={rows.length > 0}
          aria-controls="xorganize-tag-options"
          aria-activedescendant={highlight >= 0 ? optionId(highlight) : undefined}
          placeholder={applied.length === 0 ? 'Add a tag' : ''}
          maxLength={MAX_TAG_NAME * 2}
          autocomplete="off"
          spellcheck={false}
        />
      </div>
      <ul id="xorganize-tag-options" role="listbox" aria-label="Matching tags">
        {rows.map((row, index) => (
          <li
            key={row.kind === 'tag' ? row.tag.id : `create:${row.name}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === highlight}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(nameOf(row))}
          >
            <PopoverRow row={row} />
          </li>
        ))}
      </ul>
      {failed ? (
        <p class="error" role="alert">
          Could not save. Try again.
        </p>
      ) : null}
      <div class="recent">
        {recent.length > 0 ? <span>Recent:</span> : null}
        {recent.map((tag) => (
          <button
            type="button"
            key={tag.id}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => apply(tag.name)}
          >
            {tag.name}
          </button>
        ))}
      </div>
    </div>
  );
}
