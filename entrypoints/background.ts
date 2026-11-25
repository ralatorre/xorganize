import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { DIAGNOSTICS } from '@/src/build';
import { clearSource, saveCapture } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import { RECENT_TAGS, recentTags, setPostTags, suggestTags, tagsForPosts } from '@/src/db/tags';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { TAGS_PORT, type TagsChangedMessage } from '@/src/messaging/protocol';
import { createWorkerHandler, isTrustedSender } from '@/src/worker/handler';
import { createSubscribers } from '@/src/worker/subscribers';

/**
 * Background worker: wiring only. It is the only writer to the library on
 * behalf of content scripts. The browser can stop it at any time, so it keeps
 * nothing that matters in memory. What each message means is decided in
 * src/worker/handler.ts.
 */
export default defineBackground(() => {
  const db = library();
  const listeners = createSubscribers<TagsChangedMessage>();
  const handle = createWorkerHandler({
    extensionId: browser.runtime.id,
    store: {
      save: (message) => saveCapture(db, message),
      clear: (message) => clearSource(db, message.accountId, message.postId, message.source),
    },
    tags: {
      forPosts: (accountId, postIds) => tagsForPosts(db, accountId, postIds),
      suggest: async (accountId, query, limit) => ({
        suggestions: await suggestTags(db, accountId, query, limit),
        recent: await recentTags(db, accountId, RECENT_TAGS),
      }),
      set: (change) => setPostTags(db, change),
    },
    notify: (message) => listeners.broadcast(message),
    ...(DIAGNOSTICS ? { diagnostics: createDiagnosticsStore(indexedDB) } : {}),
  });

  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
  });

  // Content scripts listen here for tag changes made in other tabs.
  browser.runtime.onConnect.addListener((port) => {
    if (
      port.name !== TAGS_PORT ||
      !port.sender ||
      !isTrustedSender(port.sender, browser.runtime.id)
    ) {
      port.disconnect();
      return;
    }
    listeners.add(port);
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const reply = handle(message, sender);
    if (reply === undefined) return;
    void reply.then(sendResponse);
    return true; // respond asynchronously
  });
});
