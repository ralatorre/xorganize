import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { DIAGNOSTICS } from '@/src/build';
import { activeAccount, counts, postsBySource } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import type { Counts, StoredPost } from '@/src/db/types';
import { Diagnostics } from './Diagnostics';

const SHOWN = 50;

interface Snapshot {
  totals: Counts;
  bookmarks: StoredPost[];
  likes: StoredPost[];
}

const EMPTY: Snapshot = { totals: { bookmarks: 0, likes: 0 }, bookmarks: [], likes: [] };

async function loadSnapshot(): Promise<Snapshot> {
  const db = library();
  const account = await activeAccount(db);
  if (account === undefined) return EMPTY;
  const [totals, bookmarks, likes] = await Promise.all([
    counts(db, account),
    postsBySource(db, account, 'bookmark', SHOWN),
    postsBySource(db, account, 'like', SHOWN),
  ]);
  return { totals, bookmarks, likes };
}

/** The library's contents, kept up to date as the worker stores more. */
function useSnapshot(): Snapshot | undefined {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  useEffect(() => {
    const subscription = liveQuery(loadSnapshot).subscribe({
      next: setSnapshot,
      error: () => setSnapshot(EMPTY),
    });
    return () => subscription.unsubscribe();
  }, []);
  return snapshot;
}

export function App() {
  const snapshot = useSnapshot();
  const isEmpty = snapshot && snapshot.totals.bookmarks + snapshot.totals.likes === 0;

  return (
    <main class="library">
      <header class="library__header">
        <h1>xorganize</h1>
        {snapshot && !isEmpty ? (
          <p class="library__totals">
            {plural(snapshot.totals.bookmarks, 'bookmark')} ·{' '}
            {plural(snapshot.totals.likes, 'like')}
          </p>
        ) : null}
      </header>

      {isEmpty ? (
        <section class="library__empty" aria-labelledby="empty-title">
          <h2 id="empty-title">Your library is empty</h2>
          <p>
            Open your bookmarks or your likes on X and scroll. Posts are captured as they load and
            appear here.
          </p>
        </section>
      ) : null}

      {snapshot && !isEmpty ? (
        <>
          <p class="library__note">
            Showing the {SHOWN} most recent of each. Tagging, search and export are not available
            yet.
          </p>
          <PostList
            title="Bookmarks"
            total={snapshot.totals.bookmarks}
            posts={snapshot.bookmarks}
          />
          <PostList title="Likes" total={snapshot.totals.likes} posts={snapshot.likes} />
        </>
      ) : null}

      {DIAGNOSTICS ? <Diagnostics /> : null}
    </main>
  );
}

function PostList(props: { title: string; total: number; posts: StoredPost[] }) {
  const id = `list-${props.title.toLowerCase()}`;
  return (
    <section class="posts" aria-labelledby={id}>
      <h2 id={id}>
        {props.title} <span class="posts__count">{props.total.toLocaleString()}</span>
      </h2>
      {props.posts.length === 0 ? <p class="posts__none">None captured yet.</p> : null}
      <ol>
        {props.posts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function PostCard({ post }: { post: StoredPost }) {
  return (
    <article class="post">
      <header>
        <span class="post__name">{post.author.name}</span>{' '}
        <span class="post__meta">
          @{post.author.handle}
          {post.createdAt === null ? '' : ` · ${formatDate(post.createdAt)}`}
        </span>
      </header>
      <p class="post__text">{post.text}</p>
      <footer class="post__meta">
        {post.media.length > 0 ? <span>{plural(post.media.length, 'attachment')}</span> : null}
        {post.unavailable ? <span>Unavailable on X</span> : null}
        <a href={post.url} target="_blank" rel="noopener noreferrer">
          Open on X
        </a>
      </footer>
    </article>
  );
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

function formatDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
