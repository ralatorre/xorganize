import { Icon } from './Icon';

/** The extension's mark: the tag drawing of the inline button, on the accent colour (DESIGN, 7.3). */
export function Mark() {
  return (
    <span class="mark" aria-hidden="true">
      <Icon name="tag" size="small" />
    </span>
  );
}
