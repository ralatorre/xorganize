import type { ComponentChildren } from 'preact';
import { useCallback } from 'preact/hooks';
import { EMPTY_SNAPSHOT, POSTS_PER_SOURCE, isEmpty, type Snapshot } from '@/src/library/snapshot';
import { EmptyLibrary } from './components/EmptyLibrary';
import { ImageSetting } from './components/ImageSetting';
import { PostList } from './components/PostList';
import { Totals } from './components/Totals';
import { useLiveQuery } from './use-live-query';

export interface LibraryProps {
  /** Reads what the page shows. Re-run whenever the data it read changes. */
  load(perSource: number): Promise<Snapshot>;
  /** Turns images from X on or off. */
  setRemoteImages(enabled: boolean): void;
  perSource?: number;
  /** Shown below the library: the diagnostics panel, in that build. */
  children?: ComponentChildren;
}

/** The library page. It is handed how to read and change the library. It does not open it. */
export function App({
  load,
  setRemoteImages,
  perSource = POSTS_PER_SOURCE,
  children,
}: LibraryProps) {
  const query = useCallback(() => load(perSource), [load, perSource]);
  const snapshot = useLiveQuery(query, EMPTY_SNAPSHOT);
  const hasPosts = snapshot !== undefined && !isEmpty(snapshot);

  return (
    <main class="library">
      <header class="library__header">
        <h1>xorganize</h1>
        {hasPosts ? (
          <>
            <Totals totals={snapshot.totals} inBoth={snapshot.inBoth} />
            <ImageSetting enabled={snapshot.settings.remoteImages} onChange={setRemoteImages} />
          </>
        ) : null}
      </header>

      {snapshot && !hasPosts ? <EmptyLibrary /> : null}

      {hasPosts ? (
        <>
          <p class="library__note">
            Showing the {perSource} most recent of each. Tagging, search and export are not
            available yet.
          </p>
          <PostList
            title="Bookmarks"
            total={snapshot.totals.bookmarks}
            posts={snapshot.bookmarks}
            images={snapshot.settings.remoteImages}
          />
          <PostList
            title="Likes"
            total={snapshot.totals.likes}
            posts={snapshot.likes}
            images={snapshot.settings.remoteImages}
          />
        </>
      ) : null}

      {children}
    </main>
  );
}
