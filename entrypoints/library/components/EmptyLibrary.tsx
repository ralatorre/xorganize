import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

/** Where the first step leads. */
const BOOKMARKS_ON_X = 'https://x.com/i/bookmarks';

const STEPS: ReadonlyArray<{ title: string; detail: string }> = [
  { title: 'Open your bookmarks on X', detail: 'Posts are saved as the page loads them.' },
  {
    title: 'Scroll to the end of the list',
    detail: 'A small banner counts what has been saved. Do the same with your likes.',
  },
  {
    title: 'Tag posts anywhere on X',
    detail: 'Use the tag button next to the bookmark button, or press Alt+T.',
  },
];

/**
 * Shown until the first post is captured or imported (DESIGN, 6): what the
 * extension does, how to start, and `children`, a way to restore a backup.
 */
export function EmptyLibrary(props: { children?: ComponentChildren }) {
  return (
    <section class="empty" aria-labelledby="empty-title">
      <svg class="empty__drawing" viewBox="0 0 180 120" aria-hidden="true">
        <rect class="empty__back" x="34" y="26" width="112" height="76" rx="12" />
        <rect class="empty__card" x="22" y="16" width="112" height="76" rx="12" />
        <circle class="empty__line" cx="42" cy="36" r="8" />
        <rect class="empty__strong" x="56" y="31" width="44" height="5" rx="2.5" />
        <rect class="empty__line" x="56" y="40" width="28" height="4" rx="2" />
        <rect class="empty__line" x="34" y="54" width="86" height="5" rx="2.5" />
        <rect class="empty__line" x="34" y="64" width="64" height="5" rx="2.5" />
        <g transform="translate(118 56) rotate(18)">
          <path
            class="empty__tag"
            d="M0 6a6 6 0 0 1 6-6h22a6 6 0 0 1 4.2 1.8l14 14a6 6 0 0 1 0 8.4l-14 14a6 6 0 0 1-4.2 1.8H6a6 6 0 0 1-6-6z"
          />
          <circle class="empty__hole" cx="10" cy="20" r="4" />
        </g>
      </svg>
      <h1 id="empty-title" class="empty__title">
        Your library is empty
      </h1>
      <p class="empty__lead">
        xorganize keeps the posts you bookmark and like on X, so you can tag them, find them and
        take them with you.
      </p>
      <ol class="empty__steps">
        {STEPS.map((step, index) => (
          <li key={step.title} class="empty__step">
            <span class="empty__number" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <span class="empty__step-title">{step.title}</span>
              <span class="empty__step-detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div class="empty__actions">
        <a
          class="button button--primary button--large"
          href={BOOKMARKS_ON_X}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="bookmark" size="small" />
          Open my bookmarks on X
        </a>
        {props.children}
      </div>
      <p class="empty__privacy">
        <Icon name="privacy" size="small" />
        Everything stays in this browser. Nothing is sent anywhere.
      </p>
    </section>
  );
}
