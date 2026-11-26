import type { ComponentChildren } from 'preact';
import { useCallback, useMemo, useReducer, useRef } from 'preact/hooks';
import type { AccountId, PostId } from '@/src/db/types';
import { EMPTY_CATALOGUE, browseView, type Catalogue } from '@/src/library/browse';
import { summaryOf } from '@/src/library/format';
import { DEFAULT_VIEW, changeView } from '@/src/library/view';
import type { SearchClient } from '@/src/search/client';
import { parseQuery } from '@/src/search/query';
import { EmptyLibrary } from './components/EmptyLibrary';
import { FilterBar } from './components/FilterBar';
import { ImageSetting } from './components/ImageSetting';
import { NoMatches } from './components/NoMatches';
import { PostList } from './components/PostList';
import { SearchBox } from './components/SearchBox';
import { Sidebar } from './components/Sidebar';
import { ViewSummary } from './components/ViewSummary';
import type { LoadPosts } from './use-post-views';
import { useLiveQuery } from './use-live-query';
import { useSearchShortcut } from './use-search-shortcut';
import { useTextSearch } from './use-text-search';

export interface LibraryProps {
  /** Reads the library's sources and tags. Re-run whenever the data it read changes. */
  catalogue(): Promise<Catalogue>;
  /** Reads every post by author, for the Author order. */
  authorOrder(accountId: AccountId): Promise<PostId[]>;
  /** Reads the cards for the rows on screen. */
  posts: LoadPosts;
  /** Searches post text and authors in the search worker. */
  search: SearchClient;
  /** Turns images from X on or off. */
  setRemoteImages(enabled: boolean): void;
  /** Shown below the library: the diagnostics panel, in that build. */
  children?: ComponentChildren;
}

/**
 * The library page. It is handed how to read and change the library. It does
 * not open it. The catalogue is re-read when the library changes; each view
 * is worked out from it at once, and search results join it from the worker.
 */
export function App(props: LibraryProps) {
  const { catalogue, authorOrder, posts, search, setRemoteImages, children } = props;
  const [view, change] = useReducer(changeView, DEFAULT_VIEW);
  const searchInput = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchInput);

  const library = useLiveQuery(catalogue, EMPTY_CATALOGUE);
  const account = library?.account;
  const query = useMemo(() => parseQuery(view.query), [view.query]);
  const text = useTextSearch(search, account, query);

  // Read only while the Author order is chosen.
  const byAuthors = view.sort === 'author' && account !== undefined;
  const readAuthors = useCallback(
    () => (byAuthors ? authorOrder(account) : Promise.resolve(undefined)),
    [authorOrder, byAuthors, account],
  );
  const byAuthor = useLiveQuery(readAuthors, undefined);

  const matches = text.state === 'done' ? text.ids : undefined;
  const state = useMemo(
    () => library && browseView(library, view, { matches, byAuthor }),
    [library, view, matches, byAuthor],
  );

  if (!state) return <main class="library" />;
  if (state.account === undefined || state.counts.all === 0) {
    return (
      <main class="library library--empty">
        <h1 class="sidebar__title">xorganize</h1>
        <EmptyLibrary />
        {children}
      </main>
    );
  }

  // Until the text search answers, the list would show posts it may not match.
  const listed = text.state === 'none' || text.state === 'done';
  return (
    <div class="library">
      <Sidebar counts={state.counts} tags={state.tags} view={view} onChange={change}>
        <section class="sidebar__section" aria-labelledby="settings-title">
          <h2 id="settings-title">Settings</h2>
          <ImageSetting enabled={state.settings.remoteImages} onChange={setRemoteImages} />
        </section>
      </Sidebar>
      <main class="library__main">
        <SearchBox
          query={view.query}
          onChange={(query) => change({ type: 'query', query })}
          inputRef={searchInput}
        />
        <FilterBar selected={state.selected} match={view.match} onChange={change} />
        <ViewSummary
          status={summaryOf(text, state.ids.length)}
          sort={view.sort}
          onSort={(sort) => change({ type: 'sort', sort })}
        />
        {!listed ? null : state.ids.length > 0 ? (
          <PostList
            accountId={state.account}
            ids={state.ids}
            load={posts}
            images={state.settings.remoteImages}
          />
        ) : (
          <NoMatches onClear={() => change({ type: 'clear' })} />
        )}
        {children}
      </main>
    </div>
  );
}
