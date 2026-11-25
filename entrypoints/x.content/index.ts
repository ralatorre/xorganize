import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { X_MATCHES } from '@/src/hosts';
import { connectBridge } from '@/src/messaging/bridge';
import type { RuntimeMessage } from '@/src/messaging/protocol';

/**
 * Runs in the extension's isolated world on x.com.
 *
 * It is the only link between the page context and the extension: it validates
 * what the page-context script sends and forwards it to the background worker.
 * For now it only reports that the two scripts are connected.
 */
export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  // By default WXT announces every content script with window.postMessage,
  // including the extension's id, which any script on the page can read.
  noScriptStartedPostMessage: true,
  main() {
    connectBridge('extension', (message) => {
      if (message.kind !== 'ready') return;
      const report: RuntimeMessage = { type: 'content/ready' };
      browser.runtime.sendMessage(report).catch(() => {});
    });
  },
});
