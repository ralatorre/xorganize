/** Shown until the first post is captured. */
export function EmptyLibrary() {
  return (
    <section class="library__empty" aria-labelledby="empty-title">
      <h2 id="empty-title">Your library is empty</h2>
      <p>
        Open your bookmarks or your likes on X and scroll. Posts are captured as they load and
        appear here.
      </p>
    </section>
  );
}
