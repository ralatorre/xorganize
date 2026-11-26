import { xImageUrl } from '@/src/hosts';
import { formatDate, plural } from '@/src/library/format';
import type { PostView } from '@/src/library/posts';
import { thumbnailsOf } from '@/src/library/thumbnails';
import { Avatar } from './Avatar';
import { PostText } from './PostText';
import { QuotedPost } from './QuotedPost';
import { TagChip } from './TagChip';
import { Thumbnails } from './Thumbnails';

/** One post. With `images` off, nothing is requested from X. */
export function PostCard({ view, images }: { view: PostView; images: boolean }) {
  const { post, tags, quoted } = view;
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
        <PostText text={post.text} />
        {thumbnails.length > 0 ? (
          <Thumbnails items={thumbnails} sensitive={post.sensitive} />
        ) : null}
        {quoted ? <QuotedPost post={quoted} /> : null}
        {tags.length > 0 ? (
          <ul class="post__tags" aria-label="Tags">
            {tags.map((tag) => (
              <li key={tag.id}>
                <TagChip tag={tag} />
              </li>
            ))}
          </ul>
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
