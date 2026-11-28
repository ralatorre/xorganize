import { Icon } from './Icon';
import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

/** The card's ⋯ menu (DESIGN, 4.5): every card action, with its shortcut. */
export function PostMenu(props: {
  onTag(): void;
  onOpen(): void;
  onCopyLink(): void;
  onRemove(): void;
}) {
  return (
    <Menu
      label="More actions"
      buttonLabel="More actions"
      buttonClass="icon-button icon-button--small"
      button={<Icon name="more" size="small" />}
    >
      <MenuItem before={<Icon name="tag" size="small" />} shortcut="t" onSelect={props.onTag}>
        Edit tags
      </MenuItem>
      <MenuItem before={<Icon name="open" size="small" />} shortcut="o" onSelect={props.onOpen}>
        Open on X
      </MenuItem>
      <MenuItem before={<Icon name="copy" size="small" />} onSelect={props.onCopyLink}>
        Copy link
      </MenuItem>
      <div class="dropdown__separator" role="separator" />
      <MenuItem
        before={<Icon name="remove" size="small" />}
        danger
        detail="Its tags go with it. It comes back if it is still bookmarked or liked on X."
        onSelect={props.onRemove}
      >
        Remove from library
      </MenuItem>
    </Menu>
  );
}
