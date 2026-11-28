import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

/**
 * One choice in a `Menu`. With `checked`, it is one of a set of choices, and
 * the chosen one has a tick. `detail` is a second line saying what it means.
 */
export function MenuItem(props: {
  onSelect(): void;
  checked?: boolean;
  detail?: string;
  /** Shown before the text, such as a picture. */
  before?: ComponentChildren;
  children: ComponentChildren;
}) {
  const choice = props.checked !== undefined;
  return (
    <button
      type="button"
      class="dropdown__item"
      role={choice ? 'menuitemradio' : 'menuitem'}
      aria-checked={choice ? props.checked : undefined}
      tabIndex={-1}
      onClick={props.onSelect}
    >
      {props.before}
      <span class="dropdown__text">
        <span class="dropdown__title">{props.children}</span>
        {props.detail ? <span class="dropdown__detail">{props.detail}</span> : null}
      </span>
      {props.checked ? <Icon name="tick" size="small" /> : null}
    </button>
  );
}
