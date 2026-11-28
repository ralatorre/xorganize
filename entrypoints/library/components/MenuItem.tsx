import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

/**
 * One choice in a `Menu`. With `checked`, it is one of a set of choices, and
 * the chosen one has a tick. `detail` is a second line saying what it means,
 * and `shortcut` the key that does the same outside the menu.
 */
export function MenuItem(props: {
  onSelect(): void;
  checked?: boolean;
  detail?: string;
  /** Shown before the text, such as a picture or an icon. */
  before?: ComponentChildren;
  shortcut?: string;
  /** Destructive: drawn in the danger colour. */
  danger?: boolean;
  children: ComponentChildren;
}) {
  const choice = props.checked !== undefined;
  return (
    <button
      type="button"
      class={props.danger ? 'dropdown__item dropdown__item--danger' : 'dropdown__item'}
      role={choice ? 'menuitemradio' : 'menuitem'}
      aria-checked={choice ? props.checked : undefined}
      tabIndex={-1}
      aria-keyshortcuts={props.shortcut}
      onClick={props.onSelect}
    >
      {props.before}
      <span class="dropdown__text">
        <span class="dropdown__title">{props.children}</span>
        {props.detail ? <span class="dropdown__detail">{props.detail}</span> : null}
      </span>
      {props.shortcut ? (
        <kbd class="dropdown__key" aria-hidden="true">
          {props.shortcut}
        </kbd>
      ) : null}
      {props.checked ? <Icon name="tick" size="small" /> : null}
    </button>
  );
}
