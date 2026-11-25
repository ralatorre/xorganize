/**
 * Facts about the page that the capture design depends on, with no content:
 * how many elements each planned selector matches, and whether the account
 * cookie has the expected format.
 */

import { viewerIdFromCookie } from '@/src/capture/account';
import { SELECTORS, type SelectorName } from '@/src/dom/selectors';

export interface EnvironmentObservation {
  /** The kind of page, with handles and ids replaced by placeholders. */
  page: string;
  /** `ok`, `absent`, or the cookie value's shape with every letter and digit masked. */
  accountCookie: string;
  selectors: Record<SelectorName, number>;
}

const STATIC_SEGMENTS = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'search',
  'settings',
  'i',
  'compose',
  'bookmarks',
  'lists',
  'communities',
  'likes',
  'media',
  'with_replies',
  'highlights',
  'articles',
  'status',
  'photo',
  'video',
  'following',
  'followers',
]);

const ROUTE_WORD = /^[a-z_]{1,30}$/;

/**
 * `/someone/status/123` -> `/<handle>/status/<n>`.
 *
 * One segment is kept as written: the one straight after `/i/`. That prefix
 * is X's namespace for its own routes (`/i/bookmarks`, `/i/flow/...`), where
 * a handle cannot appear, and the route name is needed to recognise the page.
 */
export function pageKind(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean).slice(0, 6);
  const kinds = segments.map((segment, index) => {
    if (/^\d+$/.test(segment)) return '<n>';
    if (STATIC_SEGMENTS.has(segment)) return segment;
    if (index === 1 && segments[0] === 'i' && ROUTE_WORD.test(segment)) return segment;
    return index === 0 ? '<handle>' : '<other>';
  });
  return `/${kinds.join('/')}`;
}

export function accountCookieStatus(cookie: string): string {
  if (viewerIdFromCookie(cookie) !== undefined) return 'ok';
  const value = /(?:^|;\s*)twid=([^;]*)/.exec(cookie)?.[1];
  if (value === undefined) return 'absent';
  return `unexpected:${value
    .slice(0, 40)
    .replace(/[A-Za-z]/g, 'a')
    .replace(/\d/g, '9')}`;
}

export function observeEnvironment(): EnvironmentObservation {
  const selectors = {} as Record<SelectorName, number>;
  for (const name of Object.keys(SELECTORS) as SelectorName[]) {
    selectors[name] = document.querySelectorAll(SELECTORS[name]).length;
  }
  return {
    page: pageKind(location.pathname),
    accountCookie: accountCookieStatus(document.cookie),
    selectors,
  };
}
