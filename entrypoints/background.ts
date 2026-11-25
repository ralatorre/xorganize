import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { DIAGNOSTICS } from '@/src/build';
import type { EnvironmentObservation } from '@/src/diagnostics/environment';
import type { OperationObservation } from '@/src/diagnostics/observe';
import { recordEnvironment, recordOperation } from '@/src/diagnostics/store';
import { isSupportedUrl } from '@/src/hosts';
import { isRuntimeMessage } from '@/src/messaging/protocol';

/**
 * Background worker. The browser can stop it at any time, so it keeps nothing
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
