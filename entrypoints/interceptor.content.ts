import { defineContentScript } from 'wxt/utils/define-content-script';
import { DIAGNOSTICS } from '@/src/build';
import { installInterceptor } from '@/src/capture/intercept';
import { anyOperationFromUrl, knownOperationFromUrl } from '@/src/capture/operations';
import { X_MATCHES } from '@/src/hosts';
import { connectBridge } from '@/src/messaging/bridge';
import { BRIDGE_VERSION, bridgeMessage } from '@/src/messaging/protocol';

/**
 * Runs in the page's own JavaScript context, before the site's scripts.
 *
 * It observes the responses the page's client receives for a short list of
 * operations and passes them to the isolated content script. It has no access
 * to extension APIs, must never throw into the page, must never change what
 * the page sees, and must leave as little trace as possible.
 */
export default defineContentScript({
  matches: X_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    try {
      const bridge = connectBridge('page', () => {});
      bridge.send(bridgeMessage('ready'));

      installInterceptor({
        // The diagnostics build looks at every GraphQL operation, to learn
        // which ones exist. Production looks only at the ones it uses.
        operationFor: DIAGNOSTICS ? anyOperationFromUrl : knownOperationFromUrl,
        onResponse: (observed) => bridge.send({ v: BRIDGE_VERSION, kind: 'response', ...observed }),
      });
    } catch {
      // Never surface an error to the page.
    }
  },
});
