import { xImageUrl } from '@/src/hosts';
import { formatDate, plural } from '@/src/library/format';
import type { PostView } from '@/src/library/posts';
import { thumbnailsOf } from '@/src/library/thumbnails';
import { Avatar } from './Avatar';
import { PostMenu } from './PostMenu';
import { PostTags } from './PostTags';
import { PostText } from './PostText';
import { QuotedPost } from './QuotedPost';
import { Thumbnails } from './Thumbnails';

/** What a card can do with its post. */
export interface PostActions {
  /** Opens the tag popover against the card's [+]. */
  onTag(postId: string, button: HTMLElement): void;
  onCopyLink(url: string): Promise<boolean>;
  onRemove(postId: string): void;
}

/**
 * One post. It takes focus, so that `j` and `k` can move between cards. With
 * `images` off, nothing is requested from X.
 */
export function PostCard(props: { view: PostView; images: boolean; actions: PostActions }) {
  const { view, images, actions } = props;
  const { post, tags, quoted } = view;
  const thumbnails = images ? thumbnailsOf(post.media) : [];
  const author = `post-${post.id}-author`;
  return (
    <article class="post" tabIndex={0} aria-labelledby={author}>
      <Avatar name={post.author.name} src={images ? xImageUrl(post.author.avatarUrl) : undefined} />
      <div class="post__body">
        <header id={author}>
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
        <PostTags tags={tags} onTag={(button) => actions.onTag(post.id, button)} />
        <footer class="post__meta post__footer">
          {post.media.length > thumbnails.length ? (
            <span>{plural(post.media.length, 'attachment')}</span>
          ) : null}
          {post.unavailable ? <span>Unavailable on X</span> : null}
          <a href={post.url} target="_blank" rel="noopener noreferrer" data-action="open">
            Open on X
          </a>
          <PostMenu
            onCopyLink={() => actions.onCopyLink(post.url)}
            onRemove={() => actions.onRemove(post.id)}
          />
        </footer>
      </div>
    </article>
  );
}
