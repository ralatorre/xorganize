import type { ComponentChildren } from 'preact';
import { SETTINGS_HASH, type Page } from '@/src/library/route';
import { Icon } from './Icon';
import { Mark } from './Mark';

/**
 * The bar across the top (DESIGN, 4.5): the mark and name, then the search
 * box on the list or the way back from Settings, then `?`, the gear and the
 * account. Below 720 px, a filter button takes the place of `?` and the
 * account.
 */
export function Header(props: {
  page: Page;
  /** The search box, when there is something to search. */
  search?: ComponentChildren;
  /** The account shown, or its menu. */
  account?: ComponentChildren;
  /** The narrow layout's filter button: how many tags are chosen, and what opens the sheet. */
  filters?: { chosen: number; onOpen(): void };
  onHelp(): void;
}) {
  const { page, filters } = props;

  return (
    <header class="header">
      <div class="header__inner">
        <div class="brand">
          <Mark />
          <span class="brand__name">xorganize</span>
        </div>
        {page === 'settings' ? (
          <a class="button button--quiet button--small header__back" href="#">
            <Icon name="back" size="small" />
            Back to library
          </a>
        ) : (
          props.search
        )}
        <div class="header__end">
          {filters ? (
            <button
              type="button"
              class="icon-button header__filters"
              aria-label={filters.chosen > 0 ? `Filters, ${filters.chosen} chosen` : 'Filters'}
              title="Filters"
              onClick={filters.onOpen}
            >
              <Icon name="filter" />
              {filters.chosen > 0 ? (
                <span class="badge" aria-hidden="true">
                  {filters.chosen}
                </span>
              ) : null}
            </button>
          ) : null}
          {page === 'library' ? (
            <>
              <button
                type="button"
                class="icon-button header__help"
                aria-label="Keyboard shortcuts"
                aria-keyshortcuts="?"
                title="Keyboard shortcuts (?)"
                onClick={props.onHelp}
              >
                <Icon name="help" />
              </button>
              <a class="icon-button" href={SETTINGS_HASH} aria-label="Settings" title="Settings">
                <Icon name="settings" />
              </a>
            </>
          ) : null}
          {props.account ? <div class="header__account">{props.account}</div> : null}
        </div>
      </div>
    </header>
  );
}
