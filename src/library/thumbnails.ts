/** Which of a post's media can be shown as thumbnails, and from where. */

import type { CapturedMedia } from '@/src/capture/normalise';
import { xImageUrl } from '@/src/hosts';

/** Thumbnails shown per post. */
export const MAX_THUMBNAILS = 4;

export interface Thumbnail {
  src: string;
  kind: CapturedMedia['kind'];
  alt: string;
}

/**
 * Still images for the post's media, on X's image host only. Video files are
 * never loaded: a video or gif is shown by its still image.
 */
export function thumbnailsOf(media: CapturedMedia[], max = MAX_THUMBNAILS): Thumbnail[] {
  return media.slice(0, max).flatMap((item) => {
    const src = xImageUrl(item.kind === 'photo' ? item.url : item.previewUrl);
    return src ? [{ src, kind: item.kind, alt: item.alt ?? '' }] : [];
  });
}
