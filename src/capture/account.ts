/**
 * The logged-in account's numeric id, read from the `twid` cookie.
 *
 * Only the digits are extracted. The cookie string itself is never stored or
 * sent anywhere. The cookie's format is an assumption to verify (spec, 18).
 */
const TWID = /(?:^|;\s*)twid="?u(?:%3D|=)(\d{1,20})"?\s*(?:;|$)/;

export function viewerIdFromCookie(cookie: string): string | undefined {
  return TWID.exec(cookie)?.[1];
}
