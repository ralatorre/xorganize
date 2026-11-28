import type { SourceFilter } from '@/src/library/view';
import type { IconName } from '../icons';

/** Each source's icon in the sidebar. */
export const SOURCE_ICONS: Record<SourceFilter, IconName> = {
  all: 'all',
  bookmarks: 'bookmark',
  likes: 'like',
  tagged: 'tag',
  untagged: 'untagged',
};
