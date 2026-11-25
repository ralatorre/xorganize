/**
 * Inline tagging on x.com: wiring only. Decisions live in src/inline; the
 * controls are in this directory.
 */

import type { CapturedPost } from '@/src/capture/normalise';
import { themeOfColour, type Theme } from '@/src/dom/theme';
import { createKeyboardGuard, contain } from '@/src/inline/keyboard-guard';
import { matchesShortcut } from '@/src/inline/shortcut';
import { createTagState } from '@/src/inline/tag-state';
import { createTagger } from '@/src/inline/tagger';
import { createTagsListener, type ListeningPort } from '@/src/inline/tags-port';
import { SELECTORS } from '@/src/dom/selectors';
import {
  MAX_SUGGESTIONS,
  type RuntimeMessage,
  type TagsForPostsReply,
  type TagsSetReply,
  type TagsSuggestReply,
} from '@/src/messaging/protocol';
import { startMounter } from './mounter';
import { createPopover } from './popover';
import { createTagButton, type TagButton } from './tag-button';

/** Suggestions shown in the popover. */
const SUGGESTIONS = 8;

export interface InlineTaggingDependencies {
  send<Reply>(message: RuntimeMessage): Promise<Reply | undefined>;
  connect(): ListeningPort;
  accountId(): string | undefined;
  postFor(postId: string): { post: CapturedPost; partial: boolean } | undefined;
  /** Says that a change could not be saved. */
  onFailed(): void;
}

/** Must run at document_start, so the keyboard guard is in place before any page script. */
export function startInlineTagging(deps: InlineTaggingDependencies): void {
  const guard = createKeyboardGuard(window);
  const buttons = new Map<string, Set<TagButton>>();
  const unwatch = new Map<TagButton, () => void>();
  let theme: Theme = 'light';

  const withAccount = <Message extends RuntimeMessage>(build: (accountId: string) => Message) => {
    const accountId = deps.accountId();
    return accountId === undefined ? undefined : build(accountId);
  };

  const state = createTagState({
    schedule: (task) => void setTimeout(task, 0),
    fetch: async (postIds) => {
      const message = withAccount((accountId) => ({
        type: 'tags/for-posts' as const,
        accountId,
        postIds,
      }));
      if (!message) return undefined;
      listener.ensure();
      const reply = await deps.send<TagsForPostsReply>(message);
      return reply?.ok ? new Map(reply.posts.map(({ postId, tags }) => [postId, tags])) : undefined;
    },
  });

  const listener = createTagsListener({
    connect: deps.connect,
    accountId: deps.accountId,
    onChange: (postId, tags) => state.set(postId, tags),
    onReconnect: () => state.refresh(),
  });

  const change = createTagger({
    accountId: deps.accountId,
    send: (message) => {
      listener.ensure();
      return deps.send<TagsSetReply>(message);
    },
    postFor: deps.postFor,
    state,
    onFailed: (postId) => {
      for (const button of buttons.get(postId) ?? []) button.shake();
      deps.onFailed();
    },
  });

  const popover = createPopover({
    state,
    change,
    guard,
    theme: () => theme,
    mountPoint: () => document.body ?? document.documentElement,
    suggest: async (query) => {
      const message = withAccount((accountId) => ({
        type: 'tags/suggest' as const,
        accountId,
        query,
        limit: Math.min(SUGGESTIONS, MAX_SUGGESTIONS),
      }));
      const reply = message ? await deps.send<TagsSuggestReply>(message) : undefined;
      return reply?.ok ? { suggestions: reply.suggestions, recent: reply.recent } : undefined;
    },
  });

  startMounter<TagButton>({
    enabled: () => deps.accountId() !== undefined,
    beforeCheck: () => {
      if (document.body) theme = themeOfColour(getComputedStyle(document.body).backgroundColor);
    },
    create: (postId) => {
      const button = createTagButton(postId, (control) => popover.toggle(control));
      guard.protect(button.host);
      contain(button.host);
      return button;
    },
    attached: (button) => {
      button.setTheme(theme);
      let group = buttons.get(button.postId);
      if (!group) buttons.set(button.postId, (group = new Set()));
      group.add(button);
      unwatch.set(
        button,
        state.watch(button.postId, (tags) => button.show(tags)),
      );
    },
    detached: (button) => {
      unwatch.get(button)?.();
      unwatch.delete(button);
      const group = buttons.get(button.postId);
      group?.delete(button);
      if (group?.size === 0) buttons.delete(button.postId);
    },
  });

  // Alt+T on a focused post opens its popover.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!matchesShortcut(event)) return;
      const focused = document.activeElement;
      const article = focused instanceof Element ? focused.closest(SELECTORS.post) : null;
      if (!article) return;
      for (const group of buttons.values()) {
        for (const button of group) {
          if (article.contains(button.host)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            popover.toggle(button);
            return;
          }
        }
      }
    },
    true,
  );
}
