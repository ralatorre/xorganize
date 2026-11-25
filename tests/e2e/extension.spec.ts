import { expect, test } from './fixtures';

// Minimal typing for the extension API the tests use inside the worker.
declare const chrome: {
  runtime: {
    onMessage: {
      addListener(listener: (message: { type?: unknown }, sender: { url?: string }) => void): void;
    };
  };
};

type Seen = Array<{ type: unknown; url?: string }>;

// Both run inside the background worker, so they must not use anything from this file.

/** Starts recording every runtime message the worker receives. */
const startRecording = () => {
  const store = globalThis as unknown as { seen: Seen };
  store.seen = [];
  chrome.runtime.onMessage.addListener((message, sender) => {
    store.seen.push({ type: message.type, url: sender.url });
  });
};

const recorded = () => (globalThis as unknown as { seen: Seen }).seen;

/**
 * A stand-in for x.com whose first script behaves like a site trying to detect
 * extensions: it records every message event, every event dispatched from page
 * JavaScript, and every listener registration, starting as early as a page can.
 */
const PROBING_PAGE = `<!doctype html>
<html>
  <head>
    <script>
      window.observed = [];
      window.addEventListener('message', (event) => {
        window.observed.push('message ' + JSON.stringify(event.data));
      });
      const proto = EventTarget.prototype;
      const { dispatchEvent, addEventListener } = proto;
      proto.dispatchEvent = function (event) {
        window.observed.push('dispatch ' + event.type);
        return dispatchEvent.call(this, event);
      };
      proto.addEventListener = function (type, ...rest) {
        window.observed.push('listen ' + type);
        return addEventListener.call(this, type, ...rest);
      };
      window.fetchSource = Function.prototype.toString.call(window.fetch);
    </script>
    <title>stand-in</title>
  </head>
  <body><main>stand-in page</main></body>
</html>`;

test('library page renders its empty state', async ({ context, extensionId }) => {
  const page = await context.newPage();
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });

  await page.goto(`chrome-extension://${extensionId}/library.html`);

  await expect(page).toHaveTitle('xorganize');
  await expect(page.getByRole('heading', { level: 1, name: 'xorganize' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
  expect(violations).toEqual([]);
});

test('the browser blocks network requests from extension pages', async ({
  context,
  extensionId,
}) => {
  // The request would succeed if it were allowed out: it is answered here.
  await context.route('https://x.com/**', (route) =>
    route.fulfill({ contentType: 'text/plain', body: 'reached' }),
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);

  // Wait for the policy violation itself, so that the test proves the browser
  // refused the request, not merely that it failed.
  const outcome = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) => {
      document.addEventListener(
        'securitypolicyviolation',
        (event) => resolve(`${event.effectiveDirective} ${event.blockedURI}`),
        { once: true },
      );
    });
    const fetched = await fetch('https://x.com/').then(
      () => 'allowed',
      () => 'refused',
    );
    return { fetched, violation: await violation };
  });

  expect(outcome).toEqual({ fetched: 'refused', violation: 'connect-src https://x.com/' });
});

test('the browser blocks network requests from the background worker', async ({
  serviceWorker,
}) => {
  const outcome = await serviceWorker.evaluate(async () => {
    const violation = new Promise<string>((resolve) => {
      self.addEventListener(
        'securitypolicyviolation',
        (event) => {
          const { effectiveDirective, blockedURI } = event as SecurityPolicyViolationEvent;
          resolve(`${effectiveDirective} ${blockedURI}`);
        },
        { once: true },
      );
    });
    const fetched = await fetch('https://x.com/').then(
      () => 'allowed',
      () => 'refused',
    );
    return { fetched, violation: await violation };
  });

  expect(outcome).toEqual({ fetched: 'refused', violation: 'connect-src https://x.com/' });
});

test('the three parts connect on x.com without the page being able to tell', async ({
  context,
  serviceWorker,
}) => {
  // Served from a fixture: the real site is never contacted.
  await context.route('https://x.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: PROBING_PAGE }),
  );
  await serviceWorker.evaluate(startRecording);

  const page = await context.newPage();
  await page.goto('https://x.com/home');

  // Page-context script -> isolated content script -> background worker.
  await expect
    .poll(() => serviceWorker.evaluate(recorded))
    .toEqual([{ type: 'content/ready', url: 'https://x.com/home' }]);

  // The page saw nothing: no messages, no events, no listeners, no DOM changes.
  await page.waitForLoadState('load');
  const probe = await page.evaluate(() => {
    const page = window as unknown as { observed: string[]; fetchSource: string };
    return {
      observed: page.observed,
      fetchSource: page.fetchSource,
      htmlAttributes: document.documentElement.getAttributeNames(),
      bodyChildren: document.body.children.length,
      headChildren: document.head.children.length,
    };
  });
  expect(probe).toEqual({
    observed: [],
    fetchSource: 'function fetch() { [native code] }',
    htmlAttributes: [],
    bodyChildren: 1,
    headChildren: 2,
  });
});

test('nothing runs on other sites', async ({ context, serviceWorker }) => {
  await context.route('https://example.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: PROBING_PAGE }),
  );
  await serviceWorker.evaluate(startRecording);

  const page = await context.newPage();
  await page.goto('https://example.com/home');
  await page.waitForLoadState('load');
  await page.waitForTimeout(500);

  expect(await serviceWorker.evaluate(recorded)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { observed: string[] }).observed)).toEqual(
    [],
  );
});
