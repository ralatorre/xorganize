import type { StoredAccount } from '@/src/db/types';
import { xImageUrl } from '@/src/hosts';
import { Icon } from './Icon';
import { RemoteImage } from './RemoteImage';

/**
 * An account's picture as x.com last showed it, loaded like every image from
 * X (6.2), or the account icon when images are off or there is none.
 */
export function AccountAvatar(props: { account: StoredAccount; images: boolean; size: number }) {
  const placeholder = (
    <span class="account__avatar">
      <Icon name="account" size="small" />
    </span>
  );
  const src = props.images ? xImageUrl(props.account.avatarUrl) : undefined;
  if (src === undefined) return placeholder;
  return (
    <RemoteImage
      key={src}
      class="account__avatar"
      src={src}
      alt=""
      width={props.size}
      height={props.size}
      fallback={placeholder}
    />
  );
}
