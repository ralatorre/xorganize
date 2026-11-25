import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DIAGNOSTICS } from '@/src/build';
import { viewerIdFromCookie } from '@/src/capture/account';
import { createCapture } from '@/src/capture/pipeline';
import { observeEnvironment } from '@/src/diagnostics/environment';
import { observe } from '@/src/diagnostics/observe';
import { X_MATCHES } from '@/src/hosts';
import { connectBridge } from '@/src/messaging/bridge';
import type { CaptureReply, RuntimeMessage } from '@/src/messaging/protocol';
import { createBanner } from './banner';

/**
 * Runs in the extension's isolated world on x.com.
 *
 * It is the only link between the page context and the extension: it validates
 * what the page-context script sends, picks out the posts, and hands them to
 * the background worker to store.
 */
export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  // By default WXT announces every content script with window.postMessage,
  // including the extension's id, which any script on the page can read.
  noScriptStartedPostMessage: true,
  main() {
    const send = <Reply = unknown>(message: RuntimeMessage): Promise<Reply | undefined> =>
      browser.runtime.sendMessage(message).catch(() => undefined);

    const banner = createBanner();
    const capture = createCapture({
      viewerId: () => viewerIdFromCookie(document.cookie),
      send: (message) => send<CaptureReply>(message),
      onCaptured: (source, counts) => banner.show(source, counts),
    });

    let environmentProbe: ReturnType<typeof setTimeout> | undefined;

    connectBridge('extension', (message) => {
      if (message.kind === 'ready') {
        void send({ type: 'content/ready' });
        return;
      }
      if (message.kind !== 'response') return;

      void capture(message).catch(() => {});

      if (DIAGNOSTICS) {
        // Only a description of the response's structure leaves this script.
        const summary = observe(message, viewerIdFromCookie(document.cookie));
        void send({ type: 'diagnostics/operation', payload: { ...summary } });

        // Once the page has settled, record how many elements each selector finds.
        clearTimeout(environmentProbe);
        environmentProbe = setTimeout(() => {
          void send({ type: 'diagnostics/environment', payload: { ...observeEnvironment() } });
        }, 1500);
      }
    });
  },
});
