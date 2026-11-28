import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { DIAGNOSTICS } from '@/src/build';
import { clearSource, recordHandle, recordXTheme, saveCapture } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import { RECENT_TAGS, recentTags, setPostTags, suggestTags, tagsForPosts } from '@/src/db/tags';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { TAGS_CHANNEL, TAGS_PORT, type PortMessage } from '@/src/messaging/protocol';
import { createEditRelay, createWorkerHandler, isTrustedSender } from '@/src/worker/handler';
import { createSubscribers } from '@/src/worker/subscribers';

/**
 * Background worker: wiring only. It is the only writer to the library on
 * behalf of content scripts. The browser can stop it at any time, so it keeps
 * nothing that matters in memory. What each message means is decided in
 * src/worker/handler.ts.
 */
export default defineBackground(() => {
  const db = library();
  const listeners = createSubscribers<PortMessage>();
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
    recordTheme: (theme) => recordXTheme(db, theme),
    recordHandle: (accountId, handle) => recordHandle(db, accountId, handle),
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

  // The library announces its tag edits here, for the content scripts to catch up.
  const relay = createEditRelay((message) => listeners.broadcast(message));
  new BroadcastChannel(TAGS_CHANNEL).addEventListener('message', (event) => relay(event.data));

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const reply = handle(message, sender);
    if (reply === undefined) return;
    void reply.then(sendResponse);
    return true; // respond asynchronously
  });
});
