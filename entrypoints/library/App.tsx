import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import { DIAGNOSTICS } from '@/src/build';
import type { CapturedMedia } from '@/src/capture/normalise';
import {
  DEFAULT_SETTINGS,
  activeAccount,
  countInBoth,
  counts,
  postsBySource,
  readSettings,
  updateSettings,
} from '@/src/db/repo';
import { library } from '@/src/db/schema';
import type { Counts, Settings, StoredPost } from '@/src/db/types';
import { xImageUrl } from '@/src/hosts';
import { Diagnostics } from './Diagnostics';

const SHOWN = 50;
/** Thumbnails shown per post. */
const THUMBNAILS = 4;

interface Snapshot {
  totals: Counts;
  /** Posts that are both bookmarked and liked, and so are counted in both totals. */
  inBoth: number;
  bookmarks: StoredPost[];
  likes: StoredPost[];
  settings: Settings;
}

const EMPTY: Snapshot = {
  totals: { bookmarks: 0, likes: 0 },
  inBoth: 0,
  bookmarks: [],
  likes: [],
  settings: DEFAULT_SETTINGS,
};

async function loadSnapshot(): Promise<Snapshot> {
  const db = library();
  const [account, settings] = await Promise.all([activeAccount(db), readSettings(db)]);
  if (account === undefined) return { ...EMPTY, settings };
  const [totals, inBoth, bookmarks, likes] = await Promise.all([
    counts(db, account),
    countInBoth(db, account),
    postsBySource(db, account, 'bookmark', SHOWN),
    postsBySource(db, account, 'like', SHOWN),
  ]);
  return { totals, inBoth, bookmarks, likes, settings };
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
            {snapshot.inBoth > 0 ? ` · ${snapshot.inBoth.toLocaleString()} in both` : ''}
          </p>
        ) : null}
        {snapshot && !isEmpty ? <ImageSetting enabled={snapshot.settings.remoteImages} /> : null}
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

      {DIAGNOSTICS ? <Diagnostics /> : null}
    </main>
  );
}

/**
 * Images are the library's only network traffic, so they can be turned off.
 * When off, nothing is requested from X at all.
 */
function ImageSetting({ enabled }: { enabled: boolean }) {
  return (
    <label class="library__setting">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) =>
          void updateSettings(library(), { remoteImages: event.currentTarget.checked })
        }
      />{' '}
      Show images from X
      <span class="library__hint">
        Avatars and thumbnails load from X's image server, without cookies.
      </span>
    </label>
  );
}

function PostList(props: { title: string; total: number; posts: StoredPost[]; images: boolean }) {
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
            <PostCard post={post} images={props.images} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function PostCard({ post, images }: { post: StoredPost; images: boolean }) {
  const thumbnails = images ? thumbnailsOf(post.media) : [];
  return (
    <article class="post">
      <Avatar
        key={post.author.avatarUrl}
        name={post.author.name}
        src={images ? xImageUrl(post.author.avatarUrl) : undefined}
      />
      <div class="post__body">
        <header>
          <span class="post__name">{post.author.name}</span>{' '}
          <span class="post__meta">
            @{post.author.handle}
            {post.createdAt === null ? '' : ` · ${formatDate(post.createdAt)}`}
          </span>
        </header>
        <p class="post__text">{post.text}</p>
        {thumbnails.length > 0 ? (
          <Thumbnails items={thumbnails} sensitive={post.sensitive} />
        ) : null}
        <footer class="post__meta">
          {post.media.length > thumbnails.length ? (
            <span>{plural(post.media.length, 'attachment')}</span>
          ) : null}
          {post.unavailable ? <span>Unavailable on X</span> : null}
          <a href={post.url} target="_blank" rel="noopener noreferrer">
            Open on X
          </a>
        </footer>
      </div>
    </article>
  );
}

/**
 * Attributes shared by every image loaded from X. `crossorigin="anonymous"`
 * makes the browser leave out cookies, and the referrer is withheld too, so a
 * request carries only the image's address.
 */
const REMOTE_IMAGE = {
  loading: 'lazy',
  decoding: 'async',
  referrerpolicy: 'no-referrer',
  crossorigin: 'anonymous',
} as const;

function Avatar({ name, src }: { name: string; src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (src === undefined || failed) {
    return (
      <span class="avatar avatar--placeholder" aria-hidden="true">
        {Array.from(name.trim())[0]?.toUpperCase() ?? '?'}
      </span>
    );
  }
  return (
    <img
      class="avatar"
      src={src}
      alt=""
      width={40}
      height={40}
      {...REMOTE_IMAGE}
      onError={() => setFailed(true)}
    />
  );
}

interface Thumbnail {
  src: string;
  kind: CapturedMedia['kind'];
  alt: string;
}

/** Still images that can be shown for the post's media. Video files are never loaded. */
function thumbnailsOf(media: CapturedMedia[]): Thumbnail[] {
  return media.slice(0, THUMBNAILS).flatMap((item) => {
    const src = xImageUrl(item.kind === 'photo' ? item.url : item.previewUrl);
    return src ? [{ src, kind: item.kind, alt: item.alt ?? '' }] : [];
  });
}

/** Media X marks as sensitive is not loaded until the user asks for it. */
function Thumbnails({ items, sensitive }: { items: Thumbnail[]; sensitive: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (sensitive && !revealed) {
    return (
      <div class="thumbnails thumbnails--hidden">
        <button type="button" onClick={() => setRevealed(true)}>
          Show sensitive media
        </button>
      </div>
    );
  }
  return (
    <ul class="thumbnails">
      {items.map((item) => (
        <li key={item.src} class="thumbnail">
          <ThumbnailImage item={item} />
          {item.kind === 'photo' ? null : (
            <span class="thumbnail__badge">{item.kind === 'video' ? 'Video' : 'GIF'}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ThumbnailImage({ item }: { item: Thumbnail }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span class="thumbnail__missing">Image not available</span>;
  return <img src={item.src} alt={item.alt} {...REMOTE_IMAGE} onError={() => setFailed(true)} />;
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
