import type { AccountId, StoredAccount } from '@/src/db/types';
import { accountLabel } from '@/src/library/accounts';
import { AccountAvatar } from './AccountAvatar';
import { plural } from '@/src/library/format';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

/** Picture sizes in pixels: in the header, and in the menu. */
const HEADER_AVATAR = 28;
const MENU_AVATAR = 24;

/**
 * The X account whose library is shown (DESIGN, 4.5 and 6). With more than
 * one account in this browser, it is a menu that switches between them.
 */
export function AccountMenu(props: {
  accounts: readonly StoredAccount[];
  shown: AccountId | undefined;
  /** Whether pictures may load from X. */
  images: boolean;
  onChoose(accountId: AccountId): void;
}) {
  const shown = props.accounts.find(({ accountId }) => accountId === props.shown);
  if (!shown) return null;
  const label = accountLabel(shown);
  const content = (
    <>
      <AccountAvatar account={shown} images={props.images} size={HEADER_AVATAR} />
      <span class="account__name">{label}</span>
    </>
  );
  if (props.accounts.length < 2) {
    return (
      <span class="account" title="The X account whose library this is">
        {content}
      </span>
    );
  }
  return (
    <Menu
      label={`X account: ${label}`}
      buttonClass="account"
      button={
        <>
          {content}
          <Icon name="chevron" size="small" />
        </>
      }
    >
      <p class="dropdown__label" aria-hidden="true">
        X accounts in this browser
      </p>
      {props.accounts.map((account) => (
        <MenuItem
          key={account.accountId}
          checked={account.accountId === props.shown}
          detail={plural(account.posts, 'post')}
          before={<AccountAvatar account={account} images={props.images} size={MENU_AVATAR} />}
          onSelect={() => props.onChoose(account.accountId)}
        >
          {accountLabel(account)}
        </MenuItem>
      ))}
      <p class="dropdown__note">
        Each X account has its own library. Sign in to X to add posts to another.
      </p>
    </Menu>
  );
}
