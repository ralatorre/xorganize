/**
 * The signed-in account's @handle and picture, as X's sidebar shows them
 * (SPEC, 7.7): the handle from the address of the link to the account's own
 * profile, `/<handle>`, and the picture from the avatar in X's account
 * button that belongs to that handle.
 */

import { isHandle } from '@/src/guards';
import { isXAvatarUrl } from '@/src/hosts';

const PROFILE_PATH = /^\/([^/?#]+)$/;

/** From the profile link's `href` attribute. Anything but `/<handle>` gives undefined. */
export function handleOfProfileLink(href: string | null | undefined): string | undefined {
  const handle = href ? PROFILE_PATH.exec(href)?.[1] : undefined;
  return isHandle(handle) ? handle : undefined;
}

/** Where the account's own avatar is, inside X's account button. Only for a valid handle. */
export function avatarSelector(handle: string): string {
  return `[data-testid="UserAvatar-Container-${handle}"] img`;
}

/** From the avatar's `src`: a profile picture on X's image server, or undefined. */
export function avatarOfImage(src: string | null | undefined): string | undefined {
  return src && isXAvatarUrl(src) ? src : undefined;
}
