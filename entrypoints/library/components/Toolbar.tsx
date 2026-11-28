import type { ComponentChildren } from 'preact';

/**
 * Above the list (DESIGN, 4.5): the view's title and how many posts it
 * lists, or how the search is going, then `children`: the Sort and Export
 * menus. `hint` says what the view is for, under its title.
 */
export function Toolbar(props: {
  title: string;
  status: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <>
      <div class="toolbar">
        <h1 class="toolbar__title">{props.title}</h1>
        <span class="toolbar__count" role="status">
          {props.status}
        </span>
        <span class="toolbar__menus">{props.children}</span>
      </div>
      {props.hint ? <p class="toolbar__hint">{props.hint}</p> : null}
    </>
  );
}
