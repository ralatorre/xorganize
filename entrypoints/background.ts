import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { DIAGNOSTICS } from '@/src/build';
import { clearSource, saveCapture } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import { createDiagnosticsStore } from '@/src/diagnostics/store';
import { createWorkerHandler } from '@/src/worker/handler';

/**
 * Background worker: wiring only. It is the only writer to the library on
 * behalf of content scripts. The browser can stop it at any time, so it keeps
 * nothing that matters in memory. What each message means is decided in
 * src/worker/handler.ts.
 */
export default defineBackground(() => {
  const db = library();
  const handle = createWorkerHandler({
    extensionId: browser.runtime.id,
    store: {
      save: (message) => saveCapture(db, message),
      clear: (message) => clearSource(db, message.accountId, message.postId, message.source),
    },
    ...(DIAGNOSTICS ? { diagnostics: createDiagnosticsStore(indexedDB) } : {}),
  });

  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const reply = handle(message, sender);
    if (reply === undefined) return;
    void reply.then(sendResponse);
    return true; // respond asynchronously
  });
});
