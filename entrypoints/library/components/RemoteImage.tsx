import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

/**
 * An image from X's image server. `crossorigin="anonymous"` makes the browser
 * leave out cookies, and the referrer is withheld too, so a request carries
 * only the image's address (docs/SPEC.md, 6.2). If it fails to load,
 * `fallback` is shown in its place.
 */
export function RemoteImage(props: {
  src: string;
  alt: string;
  class?: string;
  width?: number;
  height?: number;
  fallback: ComponentChildren;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{props.fallback}</>;
  return (
    <img
      class={props.class}
      src={props.src}
      alt={props.alt}
      width={props.width}
      height={props.height}
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      crossorigin="anonymous"
      onError={() => setFailed(true)}
    />
  );
}
