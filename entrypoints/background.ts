import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
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

    sendResponse({ ok: true });
  });
});
