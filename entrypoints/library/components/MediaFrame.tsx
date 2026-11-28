import { useState } from 'preact/hooks';
import type { Thumbnail } from '@/src/library/thumbnails';
import { RemoteImage } from './RemoteImage';

/**
 * A post's media in one rounded frame, laid out as X does (DESIGN, 4.5): one
 * wide, two side by side, three as one tall and two small, four as a grid.
 * A video or gif is its still, with a badge. Media marked sensitive is not
 * loaded until asked for.
 */
export function MediaFrame({ items, sensitive }: { items: Thumbnail[]; sensitive: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (sensitive && !revealed) {
    return (
      <div class="media media--hidden">
        <button type="button" class="button button--small" onClick={() => setRevealed(true)}>
          Show sensitive media
        </button>
      </div>
    );
  }
  return (
    <ul class={`media media--${items.length}`}>
      {items.map((item) => (
        <li key={item.src} class="media__cell">
          <RemoteImage
            src={item.src}
            alt={item.alt}
            fallback={<span class="media__missing">Image not available</span>}
          />
          {item.kind === 'photo' ? null : (
            <span class="media__badge">{item.kind === 'video' ? 'Video' : 'GIF'}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
