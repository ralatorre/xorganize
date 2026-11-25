import type { ComponentChildren } from 'preact';
import { useCallback, useReducer } from 'preact/hooks';
import { EMPTY_BROWSE, type Browse } from '@/src/library/browse';
import { DEFAULT_VIEW, changeView, type View } from '@/src/library/view';
import { EmptyLibrary } from './components/EmptyLibrary';
import { FilterBar } from './components/FilterBar';
import { ImageSetting } from './components/ImageSetting';
import { NoMatches } from './components/NoMatches';
import { PostList } from './components/PostList';
import { Sidebar } from './components/Sidebar';
import { ViewSummary } from './components/ViewSummary';
import type { LoadPosts } from './use-post-views';
import { useLiveQuery } from './use-live-query';

export interface LibraryProps {
  /** Reads what a view shows. Re-run whenever the data it read changes. */
  browse(view: View): Promise<Browse>;
  /** Reads the cards for the rows on screen. */
  posts: LoadPosts;
  /** Turns images from X on or off. */
  setRemoteImages(enabled: boolean): void;
  /** Shown below the library: the diagnostics panel, in that build. */
  children?: ComponentChildren;
}

/**
 * The library page. It is handed how to read and change the library. It does
 * not open it. Controls follow `view` at once; what they select arrives from
 * the database a moment later.
 */
export function App({ browse, posts, setRemoteImages, children }: LibraryProps) {
  const [view, change] = useReducer(changeView, DEFAULT_VIEW);
  const query = useCallback(() => browse(view), [browse, view]);
  const state = useLiveQuery(query, EMPTY_BROWSE);

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

  return (
    <div class="library">
      <Sidebar counts={state.counts} tags={state.tags} view={view} onChange={change}>
        <section class="sidebar__section" aria-labelledby="settings-title">
          <h2 id="settings-title">Settings</h2>
          <ImageSetting enabled={state.settings.remoteImages} onChange={setRemoteImages} />
        </section>
      </Sidebar>
      <main class="library__main">
        <FilterBar selected={state.selected} match={view.match} onChange={change} />
        <ViewSummary
          count={state.ids.length}
          sort={view.sort}
          onSort={(sort) => change({ type: 'sort', sort })}
        />
        {state.ids.length > 0 ? (
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
