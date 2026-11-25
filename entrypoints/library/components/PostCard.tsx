import type { StoredPost } from '@/src/db/types';
import { xImageUrl } from '@/src/hosts';
import { formatDate, plural } from '@/src/library/format';
import { thumbnailsOf } from '@/src/library/thumbnails';
import { Avatar } from './Avatar';
import { Thumbnails } from './Thumbnails';

/** One post. With `images` off, nothing is requested from X. */
export function PostCard({ post, images }: { post: StoredPost; images: boolean }) {
  const thumbnails = images ? thumbnailsOf(post.media) : [];
  return (
    <article class="post">
      <Avatar name={post.author.name} src={images ? xImageUrl(post.author.avatarUrl) : undefined} />
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
