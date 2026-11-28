import type { TagSuggestion } from '@/src/db/types';
import { ColourSwatches } from './ColourSwatches';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

/**
 * A tag's ⋯ menu in the sidebar (DESIGN, 4.5): Rename, the palette, Merge
 * into another tag, and Delete. The ones that need more open a dialog.
 */
export function TagMenu(props: {
  tag: TagSuggestion;
  /** False when there is no other tag to merge into. */
  canMerge: boolean;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRename(): void;
  onRecolour(colour: number): void;
  onMerge(): void;
  onDelete(): void;
}) {
  const { tag } = props;
  return (
    <Menu
      label={`Manage ${tag.name}`}
      buttonLabel={`Manage ${tag.name}`}
      buttonClass="icon-button icon-button--small tag-row__manage"
      button={<Icon name="more" size="small" />}
      focusFirst
      floating
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <MenuItem before={<Icon name="rename" size="small" />} onSelect={props.onRename}>
        Rename…
      </MenuItem>
      <p class="dropdown__heading" aria-hidden="true">
        <Icon name="colour" size="small" />
        Change colour
      </p>
      <ColourSwatches colour={tag.color} onChoose={props.onRecolour} />
      {props.canMerge ? (
        <MenuItem before={<Icon name="merge" size="small" />} onSelect={props.onMerge}>
          Merge into…
        </MenuItem>
      ) : null}
      <div class="dropdown__separator" role="separator" />
      <MenuItem before={<Icon name="remove" size="small" />} danger onSelect={props.onDelete}>
        Delete tag…
      </MenuItem>
    </Menu>
  );
}
