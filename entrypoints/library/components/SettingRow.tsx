import type { ComponentChildren } from 'preact';

/**
 * One setting: its title, a line on what it does, and its control at the
 * right. The control names itself with `${id}-title` and `${id}-description`.
 */
export function SettingRow(props: {
  id: string;
  title: string;
  description: string;
  children: ComponentChildren;
}) {
  return (
    <div class="setting">
      <div class="setting__main">
        <div id={`${props.id}-title`} class="setting__title">
          {props.title}
        </div>
        <p id={`${props.id}-description`} class="setting__description">
          {props.description}
        </p>
      </div>
      <div class="setting__control">{props.children}</div>
    </div>
  );
}
