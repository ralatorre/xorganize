import type { ComponentChildren } from 'preact';

/** One group of Settings: a heading, what it covers, and its rows in a panel (DESIGN, 4.7). */
export function SettingsGroup(props: {
  /** Its part of the address: `#settings-<id>` jumps here. */
  id: string;
  title: string;
  description: string;
  danger?: boolean;
  children: ComponentChildren;
}) {
  return (
    <section
      id={`settings-${props.id}`}
      class="settings__group"
      aria-labelledby={`${props.id}-title`}
    >
      <h2 id={`${props.id}-title`} class="settings__title">
        {props.title}
      </h2>
      <p class="settings__description">{props.description}</p>
      <div class={props.danger ? 'panel panel--danger' : 'panel'}>{props.children}</div>
    </section>
  );
}
