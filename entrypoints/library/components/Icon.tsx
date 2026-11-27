import { ICONS, type IconName, type Shape } from '../icons';

/** Icon sizes in pixels: 18 beside interface text, 15 in small controls, 13 in chips. */
export type IconSize = 'medium' | 'small' | 'tiny';

/**
 * One of the library's icons, as inline SVG. It is decoration: the control
 * that holds it carries the accessible name.
 */
export function Icon({ name, size = 'medium' }: { name: IconName; size?: IconSize }) {
  return (
    <svg
      class={`icon icon--${size} icon--${name}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {(ICONS[name] as readonly Shape[]).map(drawn)}
    </svg>
  );
}

function drawn(shape: Shape, index: number) {
  const fill = 'filled' in shape && shape.filled ? 'icon__fill' : undefined;
  if ('path' in shape) return <path key={index} class={fill} d={shape.path} />;
  if ('circle' in shape) {
    const [cx, cy, r] = shape.circle;
    return <circle key={index} class={fill} cx={cx} cy={cy} r={r} />;
  }
  const [x, y, width, height, rx] = shape.rect;
  return <rect key={index} x={x} y={y} width={width} height={height} rx={rx} />;
}
