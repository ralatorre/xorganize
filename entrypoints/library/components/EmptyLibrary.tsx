import type { ComponentChildren } from 'preact';

/** Shown until the first post is captured or imported. `children`: a way to restore a backup. */
export function EmptyLibrary(props: { children?: ComponentChildren }) {
  return (
    <section class="library__empty" aria-labelledby="empty-title">
      <h2 id="empty-title">Your library is empty</h2>
      <p>
        Open your bookmarks or your likes on X and scroll. Posts are captured as they load and
        appear here.
      </p>
      {props.children}
    </section>
  );
}
