import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { DIAGNOSTICS } from '@/src/build';
import { viewerIdFromCookie } from '@/src/capture/account';
import { createContentHandler } from '@/src/capture/content';
import { createCapture } from '@/src/capture/pipeline';
import { SeenPosts } from '@/src/capture/seen';
import { observeEnvironment } from '@/src/diagnostics/environment';
import { createDiagnosticsForwarder } from '@/src/diagnostics/forward';
import { postFromPage } from '@/src/dom/post-from-page';
import { X_MATCHES } from '@/src/hosts';
import { connectBridge } from '@/src/messaging/bridge';
import { TAGS_PORT, type CaptureReply, type RuntimeMessage } from '@/src/messaging/protocol';
import { createBanner } from './banner';
import { startInlineTagging } from './inline';

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
    const seen = new SeenPosts();
    const inline = startInlineTagging({
      send,
      connect: () => browser.runtime.connect({ name: TAGS_PORT }),
      accountId: viewerId,
      postFor: (postId) => {
        const remembered = seen.get(postId);
        if (remembered) return { post: remembered, partial: false };
        const fromPage = postFromPage(postId);
        return fromPage ? { post: fromPage, partial: true } : undefined;
      },
      onFailed: () => banner.say('could not save tags. Try again.'),
    });

    const capture = createCapture({
      seen,
      viewerId,
      send: (message) => send<CaptureReply>(message),
      onCaptured: (source, counts) => banner.show(source, counts),
      onFailed: () => banner.fail(),
      onPrompt: (postId) => inline.prompt(postId),
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
