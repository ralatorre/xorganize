import type { AccountId, StoredAccount } from '@/src/db/types';
import { accountLabel } from '@/src/library/accounts';
import { plural } from '@/src/library/format';
import { Icon } from './Icon';
import { Menu } from './Menu';
import { MenuItem } from './MenuItem';

/**
 * The X account whose library is shown (DESIGN, 4.5 and 6). With more than
 * one account in this browser, it is a menu that switches between them.
 */
export function AccountMenu(props: {
  accounts: readonly StoredAccount[];
  shown: AccountId | undefined;
  onChoose(accountId: AccountId): void;
}) {
  const shown = props.accounts.find(({ accountId }) => accountId === props.shown);
  if (!shown) return null;
  const label = accountLabel(shown);
  const content = (
    <>
      <span class="account__avatar">
        <Icon name="account" size="small" />
      </span>
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
