/**
 * The tag popover (DESIGN, 4.2): one per tab, opened from a tag button.
 *
 * Key and input events never reach this component through the page: the
 * keyboard guard stops them on the window and hands them to `onGuarded`
 * (src/inline/keyboard-guard.ts). Clicks inside reach it normally and are
 * stopped at its host on the way out.
 */

import { render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { TagSuggestion, TagSummary } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';
import { contain, type KeyboardGuard } from '@/src/inline/keyboard-guard';
import {
  keyAction,
  moveHighlight,
  nameOf,
  recentOf,
  rowsOf,
  type Row,
} from '@/src/inline/popover-model';
import { placePopover } from '@/src/inline/position';
import type { TagState } from '@/src/inline/tag-state';
import type { TagEdit } from '@/src/inline/tagger';
import { MAX_TAG_NAME } from '@/src/tags/names';
import { createShadowHost } from './shadow';
import { POPOVER_STYLES, dotColour } from './styles';
import type { TagButton } from './tag-button';

/** How long typing must pause before suggestions are asked for. */
export const SUGGEST_DELAY_MS = 80;

export interface Suggestions {
  suggestions: TagSuggestion[];
  recent: TagSummary[];
}

export interface PopoverDependencies {
  state: TagState;
  change(postId: string, edit: TagEdit): Promise<boolean>;
  suggest(query: string): Promise<Suggestions | undefined>;
  theme(): Theme;
  guard: KeyboardGuard;
  /** Where the popover's host is attached while open. */
  mountPoint(): Element;
  suggestDelayMs?: number;
}

export interface Popover {
  /** Opens for the button's post, or closes if already open for it. */
  toggle(anchor: TagButton): void;
  close(returnFocus: boolean): void;
}

type GuardedHandler = (event: Event) => void;

export function createPopover(deps: PopoverDependencies): Popover {
  const { host, container } = createShadowHost(POPOVER_STYLES);
  contain(host);
  let onGuarded: GuardedHandler | undefined;
  deps.guard.protect(host, (event) => onGuarded?.(event));

  let anchor: TagButton | undefined;
  let reposition: (() => void) | undefined;

  const onPointerDown = (event: Event) => {
    if (event.target !== host && event.target !== anchor?.host) close(false);
  };
  const onFocusIn = (event: Event) => {
    if (event.target !== host && event.target !== anchor?.host) close(false);
  };
  const onMove = () => {
    if (!anchor?.host.isConnected) close(false);
    else reposition?.();
  };

  function close(returnFocus: boolean) {
    const closing = anchor;
    if (!closing) return;
    anchor = undefined;
    onGuarded = undefined;
    reposition = undefined;
    render(null, container);
    host.remove(); // tag names are in the page's DOM only while the popover is open
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('focusin', onFocusIn, true);
    window.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
    closing.setExpanded(false);
    if (returnFocus) closing.button.focus({ preventScroll: true });
  }

  function open(next: TagButton) {
    anchor = next;
    container.dataset.theme = deps.theme();
    deps.mountPoint().append(host);
    render(
      <TagPopover
        postId={next.postId}
        anchor={next.host}
        deps={deps}
        onClose={close}
        handleGuarded={(handler) => (onGuarded = handler)}
        handleReposition={(handler) => (reposition = handler)}
      />,
      container,
    );
    next.setExpanded(true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove, { passive: true });
  }

  return {
    toggle(next) {
      const same = anchor === next;
      close(false);
      if (!same) open(next);
    },
    close,
  };
}

function TagPopover(props: {
  postId: string;
  anchor: HTMLElement;
  deps: PopoverDependencies;
  onClose(returnFocus: boolean): void;
  handleGuarded(handler: GuardedHandler): void;
  handleReposition(handler: () => void): void;
}) {
  const { postId, deps } = props;
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
    const timer = setTimeout(
      () => {
        void deps.suggest(query).then((next) => {
          if (live && next) setFound({ ...next, query });
        });
      },
      query === '' ? 0 : (deps.suggestDelayMs ?? SUGGEST_DELAY_MS),
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [deps, query]);

  const rows = query.trim() === '' ? [] : rowsOf(query, found.suggestions, applied);
  const recent = query.trim() === '' ? recentOf(found.recent, applied) : [];
  useEffect(() => setHighlight(rows.length > 0 ? 0 : -1), [query, rows.length]);

  const position = () => {
    const element = dialog.current;
    if (!element) return;
    const place = placePopover(
      props.anchor.getBoundingClientRect(),
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
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
            <Dot colour={tag.color} />
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
            <RowContent row={row} />
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

function RowContent({ row }: { row: Row }) {
  if (row.kind === 'create') return <span class="name">+ Create “{row.name}”</span>;
  return (
    <>
      <Dot colour={row.tag.color} />
      <span class="name">{row.tag.name}</span>
      <span class="uses">{row.tag.count.toLocaleString()}</span>
    </>
  );
}

function Dot({ colour }: { colour: number }) {
  return <span class="dot" style={{ background: dotColour(colour) }} aria-hidden="true" />;
}
