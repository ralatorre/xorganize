import type { StoredPost } from '@/src/db/types';

/** The post a saved post quotes, in brief. */
export function QuotedPost({ post }: { post: StoredPost }) {
  return (
    <blockquote class="quote" cite={post.url}>
      <header>
        <span class="post__name">{post.author.name}</span>{' '}
        <span class="post__meta">@{post.author.handle}</span>
      </header>
      <p class="quote__text">{post.text}</p>
    </blockquote>
  );
}
