import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DIAGNOSTICS } from '@/src/build';
import { viewerIdFromCookie } from '@/src/capture/account';
import { createContentHandler } from '@/src/capture/content';
import { createCapture } from '@/src/capture/pipeline';
import { observeEnvironment } from '@/src/diagnostics/environment';
import { createDiagnosticsForwarder } from '@/src/diagnostics/forward';
import { postFromPage } from '@/src/dom/post-from-page';
import { X_MATCHES } from '@/src/hosts';
import { connectBridge } from '@/src/messaging/bridge';
import type { CaptureReply, RuntimeMessage } from '@/src/messaging/protocol';
import { createBanner } from './banner';

/**
 * Runs in the extension's isolated world on x.com: wiring only.
 *
 * It is the only link between the page context and the extension: it validates
 * what the page-context script sends, picks out the posts, and hands them to
 * the background worker to store. The decisions are made in src/capture.
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
    const viewerId = () => viewerIdFromCookie(document.cookie);

    const banner = createBanner();
    const capture = createCapture({
      viewerId,
      send: (message) => send<CaptureReply>(message),
      onCaptured: (source, counts) => banner.show(source, counts),
      onFailed: () => banner.fail(),
      postFromPage: (id) => postFromPage(id),
    });

    const handle = createContentHandler({
      announce: () => void send({ type: 'content/ready' }),
      capture,
      ...(DIAGNOSTICS
        ? {
            diagnostics: createDiagnosticsForwarder({
              send: (message) => void send(message),
              viewerId,
              observePage: () =>
                observeEnvironment({
                  root: document,
                  pathname: location.pathname,
                  cookie: document.cookie,
                }),
              schedule: (task, ms) => {
                const timer = setTimeout(task, ms);
                return () => clearTimeout(timer);
              },
            }),
          }
        : {}),
    });

    connectBridge('extension', handle);
  },
});
