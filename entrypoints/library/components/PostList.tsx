import type { StoredPost } from '@/src/db/types';
import { PostCard } from './PostCard';

/** One source's posts under a heading with its total. */
export function PostList(props: {
  title: string;
  total: number;
  posts: StoredPost[];
  images: boolean;
}) {
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
