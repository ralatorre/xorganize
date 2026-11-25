import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { DIAGNOSTICS } from '@/src/build';
import { clearSource, saveCapture } from '@/src/db/repo';
import { library } from '@/src/db/schema';
import type { EnvironmentObservation } from '@/src/diagnostics/environment';
import type { OperationObservation } from '@/src/diagnostics/observe';
import { recordEnvironment, recordOperation } from '@/src/diagnostics/store';
import { isSupportedUrl } from '@/src/hosts';
import { isRuntimeMessage, type CaptureReply } from '@/src/messaging/protocol';

/**
 * Background worker. It is the only writer to the library on behalf of
 * content scripts. The browser can stop it at any time, so it keeps nothing
 * that matters in memory.
 */
export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({ url: browser.runtime.getURL('/library.html') });
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Only this extension's own content scripts, in the top frame of a supported page.
    if (sender.id !== browser.runtime.id || sender.frameId !== 0) return;
    if (!isSupportedUrl(sender.url) || !isRuntimeMessage(message)) return;

    if (message.type === 'content/ready') {
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'capture/posts' || message.type === 'capture/clear') {
      const stored =
        message.type === 'capture/posts'
          ? saveCapture(library(), message)
          : clearSource(library(), message.accountId, message.postId, message.source);
      stored.then(
        (counts) => sendResponse({ ok: true, counts } satisfies CaptureReply),
        () => sendResponse({ ok: false } satisfies CaptureReply),
      );
      return true; // respond asynchronously
    }

    if (DIAGNOSTICS) {
      const { payload } = message;
      const stored =
        message.type === 'diagnostics/operation' && typeof payload.op === 'string'
          ? recordOperation(payload as unknown as OperationObservation)
          : message.type === 'diagnostics/environment' && typeof payload.page === 'string'
            ? recordEnvironment(payload as unknown as EnvironmentObservation)
            : Promise.reject(new Error('malformed diagnostics message'));
      stored.then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
      return true; // respond asynchronously
    }
  });
});
