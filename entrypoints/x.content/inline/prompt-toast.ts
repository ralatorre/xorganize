/**
 * The tag prompt (DESIGN, 4.3): a small toast after a bookmark or like on
 * X, offering to tag the post. Plain DOM in a closed shadow root, in the
 * page only while it shows. When it goes is decided in src/inline/prompt.ts.
 */

import type { Theme } from '@/src/dom/theme';
import { contain, type KeyboardGuard } from '@/src/inline/keyboard-guard';
import { createDismissTimer } from '@/src/inline/prompt';
import { createShadowHost } from '@/src/ui/shadow';
import { THEME_TOKENS } from '@/src/ui/styles';

const SVG = 'http://www.w3.org/2000/svg';

const STYLES = `
  :host { all: initial; }
  ${THEME_TOKENS}
  .toast {
    position: fixed;
    left: 50%;
    bottom: 88px;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 12px;
    box-sizing: border-box;
    max-width: calc(100vw - 16px);
    padding: 8px 8px 8px 16px;
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow);
    white-space: nowrap;
  }
  .text { flex: 1; font-weight: 700; }
  button { border: 0; font: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .action {
    padding: 6px 16px;
    border-radius: 9999px;
    background: var(--text);
    color: var(--surface);
    font-size: 14px;
    font-weight: 700;
  }
  .action:hover { opacity: 0.9; }
  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 50%;
    background: none;
    color: var(--muted);
  }
  .close:hover { background: var(--accent-tint); color: var(--accent); }
  svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
`;

export interface PromptToast {
  /** Shows the prompt, replacing one already shown. `onTag` runs on Add tags. */
  show(theme: Theme, onTag: () => void): void;
  dismiss(): void;
}

export interface PromptToastDependencies {
  guard: KeyboardGuard;
  mountPoint(): Element;
  schedule(task: () => void, ms: number): () => void;
}

export function createPromptToast(deps: PromptToastDependencies): PromptToast {
  const { host, container } = createShadowHost(document, STYLES);
  contain(host);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = 'Saved to library';
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'action';
  action.textContent = 'Add tags';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.setAttribute('aria-label', 'Dismiss');
  close.append(crossIcon());
  toast.append(text, action, close);
  container.append(toast);

  let onTag: (() => void) | undefined;

  const dismiss = () => {
    timer.stop();
    onTag = undefined;
    host.remove();
  };
  const timer = createDismissTimer({ schedule: deps.schedule, onExpire: dismiss });

  // Keys aimed at the toast stay from the page. Enter and Space still press
  // its buttons, since stopping an event does not prevent its default action.
  deps.guard.protect(host, (event) => {
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') dismiss();
  });
  toast.addEventListener('pointerenter', () => timer.hold('pointer'));
  toast.addEventListener('pointerleave', () => timer.release('pointer'));
  toast.addEventListener('focusin', () => timer.hold('focus'));
  toast.addEventListener('focusout', (event) => {
    if (!toast.contains(event.relatedTarget as Node | null)) timer.release('focus');
  });
  action.addEventListener('click', () => {
    const tag = onTag;
    dismiss();
    tag?.();
  });
  close.addEventListener('click', dismiss);

  return {
    show(theme, next) {
      onTag = next;
      container.dataset.theme = theme;
      if (!host.isConnected) deps.mountPoint().append(host);
      timer.start();
    },
    dismiss,
  };
}

function crossIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
  svg.append(path);
  return svg;
}
