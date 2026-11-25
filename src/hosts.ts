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
