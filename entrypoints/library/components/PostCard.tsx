import { useRef } from 'preact/hooks';
import type { TagId } from '@/src/db/types';
import { xImageUrl } from '@/src/hosts';
import { postDate, postLabels } from '@/src/library/format';
import type { PostView } from '@/src/library/posts';
import { thumbnailsOf } from '@/src/library/thumbnails';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { MediaFrame } from './MediaFrame';
import { PostMenu } from './PostMenu';
import { PostTags } from './PostTags';
import { PostText } from './PostText';
import { QuotedPost } from './QuotedPost';

/** What a card can do with its post. */
export interface PostActions {
  /** Opens the tag popover against the card's tag button. */
  onTag(postId: string, button: HTMLElement): void;
  onCopyLink(url: string): void;
  onRemove(postId: string): void;
  /** Shows a tag's posts; `add` puts it beside those already chosen. */
  onShowTag(tagId: TagId, add: boolean): void;
}

/**
 * One post, shaped like X's so that it is recognised at a glance (DESIGN,
 * 4.5). It takes focus, so that `j` and `k` can move between cards; its
 * actions show while it is hovered or has focus. With `images` off, nothing
 * is requested from X.
 */
export function PostCard(props: {
  view: PostView;
  images: boolean;
  actions: PostActions;
  /** The time, for dates within this year. */
  now: number;
}) {
  const { view, images, actions, now } = props;
  const { post, tags, quoted } = view;
  const thumbnails = images ? thumbnailsOf(post.media) : [];
  const author = `post-${post.id}-author`;
  const tagButton = useRef<HTMLButtonElement>(null);
  const link = useRef<HTMLAnchorElement>(null);
  const tag = (button: HTMLElement) => actions.onTag(post.id, button);

  return (
    <article class="post" tabIndex={0} aria-labelledby={author}>
      <Avatar name={post.author.name} src={images ? xImageUrl(post.author.avatarUrl) : undefined} />
      <div class="post__body">
        <header class="post__head">
          <span id={author} class="post__name">
            {post.author.name}
          </span>
          <span class="post__handle">@{post.author.handle}</span>
          {post.createdAt === null ? null : (
            <span class="post__date">· {postDate(post.createdAt, now)}</span>
          )}
          <span class="post__sources">
            {post.isBookmark ? (
              <span role="img" aria-label="Bookmarked" title="Bookmarked">
                <Icon name="bookmark" size="small" />
              </span>
            ) : null}
            {post.isLike ? (
              <span role="img" aria-label="Liked" title="Liked">
                <Icon name="like" size="small" />
              </span>
            ) : null}
          </span>
        </header>
        <PostText text={post.text} />
        {thumbnails.length > 0 ? (
          <MediaFrame items={thumbnails} sensitive={post.sensitive} />
        ) : null}
        {quoted ? <QuotedPost post={quoted} images={images} now={now} /> : null}
        <footer class="post__foot">
          <PostTags tags={tags} onShow={actions.onShowTag} onTag={tag} buttonRef={tagButton} />
          {postLabels(post, thumbnails.length).map((label) => (
            <span key={label} class="post__label">
              {label}
            </span>
          ))}
          <div class="post__actions">
            <a
              ref={link}
              class="icon-button icon-button--small"
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on X"
              aria-keyshortcuts="o"
              title="Open on X (o)"
              data-action="open"
            >
              <Icon name="open" size="small" />
            </a>
            <button
              type="button"
              class="icon-button icon-button--small"
              aria-label="Copy link"
              title="Copy link"
              onClick={() => actions.onCopyLink(post.url)}
            >
              <Icon name="copy" size="small" />
            </button>
            <PostMenu
              onTag={() => tagButton.current && tag(tagButton.current)}
              onOpen={() => link.current?.click()}
              onCopyLink={() => actions.onCopyLink(post.url)}
              onRemove={() => actions.onRemove(post.id)}
            />
          </div>
        </footer>
      </div>
    </article>
  );
}
