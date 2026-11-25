import type { SourceKind } from '@/src/capture/operations';
import type { Counts } from '@/src/db/types';

/**
 * A small status line shown on x.com after posts are captured, so the user
 * can see that capture is working and how far it has got.
 *
 * It is the one thing the extension adds to the page, and it is visible to
 * the page by design. It sits in a closed shadow root with its own styles,
 * takes no input, and shows only a count.
 */

const STYLES = `
  :host { all: initial; }
  .banner {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    z-index: 2147483647;
    padding: 8px 16px;
    border-radius: 999px;
    font: 600 14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    box-shadow: 0 2px 12px rgb(0 0 0 / 0.25);
    background: #0f1419;
    color: #ffffff;
  }
  .banner[data-theme="dark"] { background: #eff3f4; color: #0f1419; }
  .banner[hidden] { display: none; }
`;

export interface Banner {
  show(source: SourceKind, counts: Counts): void;
  /** Says plainly that posts could not be saved, so a failure is never silent. */
  fail(): void;
}

export function createBanner(): Banner {
  let line: HTMLElement | undefined;
  let shownOn: string | undefined;
  let watcher: ReturnType<typeof setInterval> | undefined;

  const mount = (): HTMLElement => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES); // a constructed stylesheet is not subject to the page's style policy
    root.adoptedStyleSheets = [sheet];

    const element = document.createElement('div');
    element.className = 'banner';
    element.setAttribute('role', 'status');
    root.append(element);
    document.documentElement.append(host);
    return element;
  };

  const hide = () => {
    if (line) line.hidden = true;
    clearInterval(watcher);
    watcher = undefined;
  };

  const display = (text: string) => {
    line ??= mount();
    line.textContent = text;
    line.dataset.theme = pageIsDark() ? 'dark' : 'light';
    line.hidden = false;

    // The line belongs to the page it was shown on. x.com changes page without
    // reloading, so watch the address and hide when it moves on.
    shownOn = location.pathname;
    watcher ??= setInterval(() => {
      if (location.pathname !== shownOn) hide();
    }, 1000);
  };

  return {
    show(source, counts) {
      const count = source === 'bookmark' ? counts.bookmarks : counts.likes;
      const noun = source === 'bookmark' ? 'bookmark' : 'like';
      display(`xorganize · ${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'} captured`);
    },
    fail() {
      display('xorganize · could not save these posts. Reload the page, or restart the browser.');
    },
  };
}

/** Whether the page currently has a dark background, so the banner can contrast with it. */
function pageIsDark(): boolean {
  const channels = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
  if (!channels || channels.length < 3) return false;
  const [red, green, blue] = channels.map(Number) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue < 128;
}
