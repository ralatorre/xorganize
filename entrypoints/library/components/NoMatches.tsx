/** Shown when the filters leave nothing. */
export function NoMatches({ onClear }: { onClear(): void }) {
  return (
    <section class="library__empty" aria-labelledby="no-matches-title">
      <h2 id="no-matches-title">No posts match</h2>
      <button type="button" class="button" onClick={onClear}>
        Clear filters
      </button>
    </section>
  );
}
