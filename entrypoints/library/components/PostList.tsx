import type { RefObject } from 'preact';
import { useRef } from 'preact/hooks';
import type { AccountId, PostId } from '@/src/db/types';
import { usePostNavigation, type PostNavigation } from '../use-post-navigation';
import { usePostViews, type LoadPosts } from '../use-post-views';
import { useWindowVirtualizer } from '../use-window-virtualizer';
import { PostCard, type PostActions } from './PostCard';

/** A guess at a card's height before it is measured. */
export const ESTIMATED_CARD_PX = 160;
/** Cards rendered beyond each edge of the viewport. */
export const OVERSCAN = 6;

/**
 * The matching posts. Only cards near the viewport are rendered and read.
 * `navigation` is given what the keyboard shortcuts can do in the list.
 */
export function PostList(props: {
  accountId: AccountId;
  ids: readonly PostId[];
  load: LoadPosts;
  images: boolean;
  actions: PostActions;
  navigation: RefObject<PostNavigation | undefined>;
}) {
  const { ids } = props;
  const list = useRef<HTMLOListElement>(null);
  const virtualizer = useWindowVirtualizer(list, {
    count: ids.length,
    estimateSize: () => ESTIMATED_CARD_PX,
    getItemKey: (index) => ids[index] ?? index,
    overscan: OVERSCAN,
  });
  props.navigation.current = usePostNavigation(list, virtualizer, ids.length);
  const rows = virtualizer.getVirtualItems();
  const views = usePostViews(
    props.load,
    props.accountId,
    ids,
    rows[0]?.index ?? 0,
    rows[rows.length - 1]?.index ?? -1,
  );
  const offset = virtualizer.options.scrollMargin;

  return (
    <ol
      ref={list}
      class="posts"
      aria-label="Posts"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {rows.map((row) => {
        const view = views.get(ids[row.index]!);
        return (
          <li
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            class="posts__row"
            aria-posinset={row.index + 1}
            aria-setsize={ids.length}
            style={{ transform: `translateY(${row.start - offset}px)` }}
          >
            {view ? (
              <PostCard view={view} images={props.images} actions={props.actions} />
            ) : (
              <div class="post post--loading" aria-busy="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
