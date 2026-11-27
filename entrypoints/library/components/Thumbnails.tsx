import { useState } from 'preact/hooks';
import type { Thumbnail } from '@/src/library/thumbnails';
import { RemoteImage } from './RemoteImage';

/** A post's media as thumbnails. Media marked sensitive is not loaded until asked for. */
export function Thumbnails({ items, sensitive }: { items: Thumbnail[]; sensitive: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (sensitive && !revealed) {
    return (
      <div class="thumbnails thumbnails--hidden">
        <button type="button" class="button button--small" onClick={() => setRevealed(true)}>
          Show sensitive media
        </button>
      </div>
    );
  }
  return (
    <ul class="thumbnails">
      {items.map((item) => (
        <li key={item.src} class="thumbnail">
          <RemoteImage
            src={item.src}
            alt={item.alt}
            fallback={<span class="thumbnail__missing">Image not available</span>}
          />
          {item.kind === 'photo' ? null : (
            <span class="thumbnail__badge">{item.kind === 'video' ? 'Video' : 'GIF'}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
