/**
 * The tag button in a post's action bar (DESIGN, 4.1). Plain DOM: there can be
 * dozens on screen, and each does little.
 */

import type { TagSummary } from '@/src/db/types';
import type { Theme } from '@/src/dom/theme';
import { createShadowHost } from '@/src/ui/shadow';
import { BUTTON_STYLES } from './styles';

const SVG = 'http://www.w3.org/2000/svg';

export interface TagButton {
  host: HTMLElement;
  button: HTMLButtonElement;
  postId: string;
  /** Points the button at another post, as X reuses an article for a new one. */
  bind(postId: string): void;
  show(tags: TagSummary[]): void;
  setTheme(theme: Theme): void;
  setExpanded(expanded: boolean): void;
  /** A brief shake, after a change could not be saved. */
  shake(): void;
}

export function createTagButton(
  postId: string,
  onActivate: (button: TagButton) => void,
): TagButton {
  const { host, container } = createShadowHost(document, BUTTON_STYLES);

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-pressed', 'false');

  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.append(tagIcon());
  const count = document.createElement('span');
  count.className = 'count';
  button.append(icon, count);
  container.append(button);

  const control: TagButton = {
    host,
    button,
    postId,
    bind(next) {
      control.postId = next;
      control.show([]);
    },
    show(tags) {
      const label = tags.length === 0 ? 'Tag' : `Tags: ${tags.map((tag) => tag.name).join(', ')}`;
      button.setAttribute('aria-label', label);
      button.title = label;
      button.setAttribute('aria-pressed', tags.length > 0 ? 'true' : 'false');
      count.textContent = tags.length > 1 ? String(tags.length) : '';
    },
    setTheme(theme) {
      container.dataset.theme = theme;
    },
    setExpanded(expanded) {
      button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    },
    shake() {
      icon.classList.remove('shake');
      void icon.offsetWidth; // restart the animation
      icon.classList.add('shake');
      setTimeout(() => icon.classList.remove('shake'), 400);
    },
  };

  button.addEventListener('click', () => onActivate(control));
  control.show([]);
  return control;
}

/** A luggage-style tag: the extension's own drawing, not X's artwork. */
function tagIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const body = document.createElementNS(SVG, 'path');
  body.setAttribute(
    'd',
    'M3 4.5A1.5 1.5 0 0 1 4.5 3H11a1.5 1.5 0 0 1 1.06.44l8.5 8.5a1.5 1.5 0 0 1 0 2.12l-6.5 6.5a1.5 1.5 0 0 1-2.12 0l-8.5-8.5A1.5 1.5 0 0 1 3 11z',
  );
  const hole = document.createElementNS(SVG, 'circle');
  hole.setAttribute('class', 'hole');
  hole.setAttribute('cx', '7.5');
  hole.setAttribute('cy', '7.5');
  hole.setAttribute('r', '1.5');
  svg.append(body, hole);
  return svg;
}
