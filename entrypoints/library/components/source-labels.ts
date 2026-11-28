import type { SourceFilter } from '@/src/library/view';
import type { IconName } from '../icons';

/** What each source is called, in the sidebar and as pills. */
export const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'All posts',
  bookmarks: 'Bookmarks',
  likes: 'Likes',
  tagged: 'Tagged only',
  untagged: 'Untagged',
};

export const SOURCE_ICONS: Record<SourceFilter, IconName> = {
  all: 'all',
  bookmarks: 'bookmark',
  likes: 'like',
  tagged: 'tag',
  untagged: 'untagged',
};
