import { initialOf } from '@/src/library/format';
import { RemoteImage } from './RemoteImage';

/** The author's picture, or their initial when there is none to load. */
export function Avatar({ name, src }: { name: string; src: string | undefined }) {
  const placeholder = (
    <span class="avatar avatar--placeholder" aria-hidden="true">
      {initialOf(name)}
    </span>
  );
  if (src === undefined) return placeholder;
  return (
    <RemoteImage
      key={src}
      class="avatar"
      src={src}
      alt=""
      width={40}
      height={40}
      fallback={placeholder}
    />
  );
}
