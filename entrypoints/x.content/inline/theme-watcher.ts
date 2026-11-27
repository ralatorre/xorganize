/**
 * Reads which theme x.com shows (SPEC, 8). A change in X's display settings
 * only restyles the page: it adds no elements, so the mounter's check for new
 * posts does not run. This also reads the theme whenever the `style` or
 * `class` of the root element or `body` changes.
 */

import { themeOfColour, type Theme } from '@/src/dom/theme';

const RESTYLED: MutationObserverInit = { attributes: true, attributeFilter: ['style', 'class'] };

/**
 * Returns a check that reads the theme now and passes it to `seen`, and that
 * starts watching `body` once there is one. Run it whenever the page may have
 * changed; `seen` is also called on every restyle.
 */
export function watchTheme(document: Document, seen: (theme: Theme) => void): () => void {
  let watched: HTMLElement | undefined;

  const check = () => {
    const body = document.body;
    if (!body) return;
    if (body !== watched) {
      watched = body;
      restyled.observe(body, RESTYLED);
    }
    seen(themeOfColour(getComputedStyle(body).backgroundColor));
  };

  const restyled = new MutationObserver(check);
  restyled.observe(document.documentElement, RESTYLED);
  return check;
}
