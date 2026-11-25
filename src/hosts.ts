/**
 * The only host the extension runs on. Keep in sync with `host_permissions`
 * in wxt.config.ts.
 *
 * twitter.com is deliberately absent: every page there redirects to x.com, so
 * asking for it would be a permission with no use.
 */
export const X_HOSTS = ['x.com'] as const;

/** Match patterns for content scripts. */
export const X_MATCHES = X_HOSTS.map((host) => `https://${host}/*`);

/** True when `url` is an https page on a supported host (no subdomains). */
export function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (X_HOSTS as readonly string[]).includes(hostname);
  } catch {
    return false;
  }
}

/**
 * The one host the library may load images from: X's image server, which
 * holds avatars, photos and the stills of videos and gifs. Keep in sync with
 * `img-src` in wxt.config.ts. Anything elsewhere is shown as a placeholder.
 */
export const X_IMAGE_HOST = 'pbs.twimg.com';

/**
 * The URL to load for an image from X, or undefined when it is not on
 * X_IMAGE_HOST. Photos are asked for at X's "small" size, which is plenty for
 * a thumbnail and much less to download than the original.
 */
export function xImageUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2048) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.hostname !== X_IMAGE_HOST || url.port !== '') {
    return undefined;
  }
  if (url.username !== '' || url.password !== '') return undefined;
  if (url.pathname.startsWith('/media/')) url.searchParams.set('name', 'small');
  return url.href;
}
