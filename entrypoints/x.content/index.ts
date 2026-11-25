import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DIAGNOSTICS } from '@/src/build';
import { viewerIdFromCookie } from '@/src/capture/account';
import { observeEnvironment } from '@/src/diagnostics/environment';
import { observe } from '@/src/diagnostics/observe';
import { X_MATCHES } from '@/src/hosts';
import { connectBridge } from '@/src/messaging/bridge';
import type { RuntimeMessage } from '@/src/messaging/protocol';

/**
 * Runs in the extension's isolated world on x.com.
 *
 * It is the only link between the page context and the extension: it validates
 * what the page-context script sends and forwards it to the background worker.
 */
export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  // By default WXT announces every content script with window.postMessage,
  // including the extension's id, which any script on the page can read.
  noScriptStartedPostMessage: true,
  main() {
    const send = (message: RuntimeMessage) => {
      browser.runtime.sendMessage(message).catch(() => {});
    };
    let environmentProbe: ReturnType<typeof setTimeout> | undefined;

    connectBridge('extension', (message) => {
      if (message.kind === 'ready') {
        send({ type: 'content/ready' });
        return;
      }
      if (message.kind !== 'response') return;

      if (DIAGNOSTICS) {
        // Only a description of the response's structure leaves this script.
        const summary = observe(message, viewerIdFromCookie(document.cookie));
        send({ type: 'diagnostics/operation', payload: { ...summary } });

        // Once the page has settled, record how many elements each selector finds.
        clearTimeout(environmentProbe);
        environmentProbe = setTimeout(() => {
          send({ type: 'diagnostics/environment', payload: { ...observeEnvironment() } });
        }, 1500);
      }

      // Production: extracting and storing posts is the next step of this milestone.
    });
  },
});
