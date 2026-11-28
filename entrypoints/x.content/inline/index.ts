/**
 * Inline tagging on x.com: wiring only. Decisions live in src/inline; the
 * controls are in this directory.
 */

import type { CapturedPost } from '@/src/capture/normalise';
import type { Theme } from '@/src/dom/theme';
import { createKeyboardGuard, contain } from '@/src/inline/keyboard-guard';
import { POPOVER_SUGGESTIONS } from '@/src/inline/popover-model';
import { isShortcutPress, matchesShortcut, postAnchor } from '@/src/inline/shortcut';
import { createTagState } from '@/src/inline/tag-state';
import { createTagger } from '@/src/inline/tagger';
import { createChangeReport } from '@/src/inline/change-report';
import { createTagsListener, type ListeningPort } from '@/src/inline/tags-port';
import { SELECTORS } from '@/src/dom/selectors';
import { avatarOfImage, avatarSelector, handleOfProfileLink } from '@/src/dom/viewer-profile';
import {
  MAX_SUGGESTIONS,
  type AccountSeenMessage,
  type RuntimeMessage,
  type TagsForPostsReply,
  type TagsSetReply,
  type TagsSuggestReply,
} from '@/src/messaging/protocol';
import { createPopover } from '@/src/ui/popover';
import { startMounter } from './mounter';
import { createTagButton, type TagButton } from './tag-button';
import { watchTheme } from './theme-watcher';

type AccountSeen = Omit<AccountSeenMessage, 'type'>;

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
  // Only a change is acted on: buttons on the page take it, and the worker is told.
  const checkTheme = watchTheme(
    document,
    createChangeReport<Theme>((seen) => {
      theme = seen;
      for (const group of buttons.values()) for (const button of group) button.setTheme(seen);
      void deps.send({ type: 'theme/seen', theme: seen });
    }),
  );
  // The account's handle and picture, for the library's header. Nothing else is read.
  const reportAccount = createChangeReport<AccountSeen>(
    (seen) => void deps.send({ type: 'account/seen', ...seen }),
    ({ accountId, handle, avatarUrl }) => `${accountId} ${handle} ${avatarUrl ?? ''}`,
  );
  const checkAccount = () => {
    const accountId = deps.accountId();
    const link = document.querySelector(SELECTORS.profileLink);
    const handle = handleOfProfileLink(link?.getAttribute('href'));
    if (accountId === undefined || handle === undefined) return;
    const switcher = document.querySelector(SELECTORS.accountSwitcher);
    const avatar = switcher?.querySelector(avatarSelector(handle));
    const avatarUrl = avatarOfImage(avatar?.getAttribute('src'));
    reportAccount(avatarUrl ? { accountId, handle, avatarUrl } : { accountId, handle });
  };

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
    onStale: () => state.refresh(),
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
    view: window,
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
        limit: Math.min(POPOVER_SUGGESTIONS, MAX_SUGGESTIONS),
      }));
      const reply = message ? await deps.send<TagsSuggestReply>(message) : undefined;
      return reply?.ok ? { suggestions: reply.suggestions, recent: reply.recent } : undefined;
    },
  });

  startMounter<TagButton>({
    enabled: () => deps.accountId() !== undefined,
    beforeCheck: () => {
      checkTheme();
      checkAccount();
    },
    create: (postId) => {
      const button = createTagButton(postId, (control) => popover.toggle(control));
      // Keys on the button stay from the page, but Alt+T still works there.
      guard.protect(button.host, (event) => {
        if (!isShortcutPress(event)) return;
        event.preventDefault();
        popover.toggle(button);
      });
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

  // Alt+T on a focused post opens its popover, and focus comes back to the post.
  window.addEventListener(
    'keydown',
    (event) => {
      if (!matchesShortcut(event)) return;
      const focused = document.activeElement;
      const article = focused instanceof Element ? focused.closest(SELECTORS.post) : null;
      if (!(article instanceof HTMLElement)) return;
      for (const group of buttons.values()) {
        for (const button of group) {
          if (article.contains(button.host)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            popover.toggle(postAnchor(button, article));
            return;
          }
        }
      }
    },
    true,
  );
}
