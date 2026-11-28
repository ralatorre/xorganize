/**
 * The signed-in account's @handle, from the link to its own profile in X's
 * sidebar (SELECTORS.profileLink), whose address is `/<handle>`.
 */

import { isHandle } from '@/src/guards';

const PROFILE_PATH = /^\/([^/?#]+)$/;

/** From the link's `href` attribute. Anything but `/<handle>` gives undefined. */
export function handleOfProfileLink(href: string | null | undefined): string | undefined {
  const handle = href ? PROFILE_PATH.exec(href)?.[1] : undefined;
  return isHandle(handle) ? handle : undefined;
}
