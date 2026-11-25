import { defineContentScript } from 'wxt/utils/define-content-script';
import { X_MATCHES } from '@/src/hosts';
import { connectBridge } from '@/src/messaging/bridge';
import { bridgeMessage } from '@/src/messaging/protocol';

/**
 * Runs in the page's own JavaScript context, before the site's scripts.
 *
 * This is where the page's network responses will be observed. It has no
 * access to extension APIs, must never throw into the page, must never change
 * what the page sees, and must leave nothing the page can detect. For now it
 * only connects to the isolated content script.
 */
export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    try {
      const bridge = connectBridge('page', () => {});
      bridge.send(bridgeMessage('ready'));
    } catch {
      // Never surface an error to the page.
    }
  },
});
