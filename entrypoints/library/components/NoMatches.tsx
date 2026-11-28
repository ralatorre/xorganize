import { Icon } from './Icon';

/**
 * Shown when the filters leave nothing (DESIGN, 6): it names what was
 * searched for and in which source, and offers a way back.
 */
export function NoMatches(props: {
  line: string;
  /** Present when there is a search to clear. */
  onClearSearch?: () => void;
  onShowAll(): void;
}) {
  return (
    <section class="no-matches" aria-labelledby="no-matches-title">
      <span class="no-matches__icon" aria-hidden="true">
        <Icon name="search" />
      </span>
      <h2 id="no-matches-title" class="no-matches__title">
        No posts match
      </h2>
      <p class="no-matches__line">{props.line}</p>
      <div class="no-matches__actions">
        {props.onClearSearch ? (
          <button type="button" class="button" onClick={props.onClearSearch}>
            Clear search
          </button>
        ) : null}
        <button type="button" class="button button--primary" onClick={props.onShowAll}>
          Show all posts
        </button>
      </div>
    </section>
  );
}
