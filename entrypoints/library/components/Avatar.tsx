import { initialOf } from '@/src/library/format';
import { RemoteImage } from './RemoteImage';

/** Avatar sizes in pixels: on a card, and in a quoted post. */
const SIZES = { medium: 40, small: 20 } as const;

/** The author's picture, or their initial when there is none to load. */
export function Avatar(props: {
  name: string;
  src: string | undefined;
  size?: keyof typeof SIZES;
}) {
  const { name, src, size = 'medium' } = props;
  const classes = `avatar avatar--${size}`;
  const placeholder = (
    <span class={`${classes} avatar--placeholder`} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
  if (src === undefined) return placeholder;
  return (
    <RemoteImage
      key={src}
      class={classes}
      src={src}
      alt=""
      width={SIZES[size]}
      height={SIZES[size]}
      fallback={placeholder}
    />
  );
}
