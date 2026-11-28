import type { StoredPost } from '@/src/db/types';
import { xImageUrl } from '@/src/hosts';
import { postDate } from '@/src/library/format';
import { Avatar } from './Avatar';

/** The post a saved post quotes, in its own rounded frame (DESIGN, 4.5). */
export function QuotedPost(props: { post: StoredPost; images: boolean; now: number }) {
  const { post } = props;
  return (
    <blockquote class="quote" cite={post.url}>
      <header class="quote__head">
        <Avatar
          name={post.author.name}
          src={props.images ? xImageUrl(post.author.avatarUrl) : undefined}
          size="small"
        />
        <span class="post__name">{post.author.name}</span>
        <span class="post__handle">@{post.author.handle}</span>
        {post.createdAt === null ? null : (
          <span class="post__date">· {postDate(post.createdAt, props.now)}</span>
        )}
      </header>
      <p class="quote__text">{post.text}</p>
    </blockquote>
  );
}
