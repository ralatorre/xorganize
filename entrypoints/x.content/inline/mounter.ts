/**
 * Puts a tag button in the action bar of every post on screen (SPEC, 8).
 *
 * X builds the page as the user scrolls and reuses article elements for new
 * posts, so this watches the document, re-checks once per frame at most, and
 * re-points a button whose article now shows a different post.
 */

import { postIdOf } from '@/src/dom/post-from-page';
import { SELECTORS } from '@/src/dom/selectors';

export interface Mountable {
  host: HTMLElement;
  postId: string;
  bind(postId: string): void;
}

export interface MounterDependencies<Control extends Mountable> {
  /** Whether buttons should be shown at all, such as when an account is signed in. */
  enabled(): boolean;
  create(postId: string): Control;
  /** Called when a button starts showing a post. */
  attached(control: Control): void;
  /** Called when a button stops showing a post. */
  detached(control: Control): void;
  /** Called once per check, before buttons are placed. */
  beforeCheck?(): void;
}

export function startMounter<Control extends Mountable>(deps: MounterDependencies<Control>) {
  const mounts = new Map<Element, Control>();
  let pending = false;

  const check = () => {
    pending = false;
    deps.beforeCheck?.();

    for (const [article, control] of mounts) {
      if (!article.isConnected) {
        mounts.delete(article);
        deps.detached(control);
      }
    }
    if (!deps.enabled()) return;

    for (const article of document.querySelectorAll(SELECTORS.post)) {
      const postId = postIdOf(article);
      const control = mounts.get(article);
      if (postId === undefined) {
        if (control) {
          control.host.remove();
          mounts.delete(article);
          deps.detached(control);
        }
        continue;
      }
      if (control && control.postId !== postId) {
        deps.detached(control);
        control.bind(postId);
        deps.attached(control);
      }
      const placed = control ?? deps.create(postId);
      if (!control) {
        mounts.set(article, placed);
        deps.attached(placed);
      }
      place(article, placed.host);
    }
  };

  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(check);
  };

  new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
  schedule();
}

/** Just before X's bookmark button, or at the end of the action bar when there is none. */
function place(article: Element, host: HTMLElement): void {
  const bar = article.querySelector('[role="group"]');
  if (!bar) return;
  const bookmark = bar.querySelector(
    `${SELECTORS.bookmarkButton}, ${SELECTORS.removeBookmarkButton}`,
  );
  const slot = bookmark?.parentElement;
  if (slot?.parentElement) {
    if (host.nextSibling !== slot || host.parentElement !== slot.parentElement) {
      slot.parentElement.insertBefore(host, slot);
    }
  } else if (host.parentElement !== bar) {
    bar.append(host);
  }
}
