/**
 * Images are the library's only network traffic, so they can be turned off.
 * When off, nothing is requested from X at all.
 */
export function ImageSetting(props: { enabled: boolean; onChange(enabled: boolean): void }) {
  return (
    <label class="library__setting">
      <input
        type="checkbox"
        role="switch"
        class="switch"
        checked={props.enabled}
        onChange={(event) => props.onChange(event.currentTarget.checked)}
      />{' '}
      Show images from X
      <span class="library__hint">
        Avatars and thumbnails load from X's image server, without cookies.
      </span>
    </label>
  );
}
