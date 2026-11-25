import type { CapturedPost } from '@/src/capture/normalise';
import { isId } from '@/src/guards';
import { SELECTORS } from './selectors';

const PERMALINK = /^\/([A-Za-z0-9_]{1,20})\/status\/(\d{1,25})$/;

/**
 * Reads the basics of a post from the page, for when the user bookmarks or
 * likes a post the extension never saw arrive from the API.
 *
 * The result is partial: handle, name, date and text only. It is replaced by
 * the full post the next time that post passes through a timeline. Everything
 * is read as text; nothing from the page is treated as markup.
 */
export function postFromPage(id: string, root: ParentNode = document): CapturedPost | undefined {
  if (!isId(id)) return undefined; // digits only, so it is safe inside the selector below

  const anchors = root.querySelectorAll<HTMLAnchorElement>(
    `${SELECTORS.post} a[href$="/status/${id}"]`,
  );
  for (const anchor of anchors) {
    // A post's own permalink is the link around its timestamp.
    const time = anchor.querySelector('time');
    const article = anchor.closest(SELECTORS.post);
    const match = PERMALINK.exec(anchor.pathname);
    if (!time || !article || !match || match[2] !== id) continue;

    const handle = match[1]!;
    const created = Date.parse(time.getAttribute('datetime') ?? '');
    const label = article.querySelector(SELECTORS.postAuthor)?.textContent ?? '';
    const name = label.split('@')[0]!.trim().slice(0, 100);

    return {
      id,
      url: `https://x.com/${handle}/status/${id}`,
      text: (article.querySelector(SELECTORS.postText)?.textContent ?? '').slice(0, 30_000),
      createdAt: Number.isFinite(created) ? created : null,
      author: { handle, name: name === '' ? handle : name },
      media: [],
      links: [],
      sensitive: false,
    };
  }
  return undefined;
}

/**
 * The id of the post an article shows, from its own permalink: the first
 * status link around a timestamp. Adverts have no timestamp link, so they
 * have no id here and get no controls.
 */
export function postIdOf(article: Element): string | undefined {
  for (const anchor of article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')) {
    if (!anchor.querySelector('time')) continue;
    const match = PERMALINK.exec(anchor.pathname);
    return match && isId(match[2]) ? match[2] : undefined;
  }
  return undefined;
}
