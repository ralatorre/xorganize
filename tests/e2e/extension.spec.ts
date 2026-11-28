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
  await expect(
    page.getByRole('heading', { level: 1, name: 'Your library is empty' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open my bookmarks on X' })).toHaveAttribute(
    'href',
    'https://x.com/i/bookmarks',
  );
  expect(violations).toEqual([]);
  // The library's own text size (DESIGN, 7.2), not the smaller one browsers give extension pages.
  expect(await page.evaluate(() => getComputedStyle(document.body).fontSize)).toBe('14px');
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

test("extension pages can load images from X's image server and nowhere else", async ({
  context,
  extensionId,
}) => {
  // Both would succeed if they were allowed out: they are answered here.
  await context.route(/^https:\/\/(pbs\.twimg\.com|abs\.twimg\.com)\//, (route) =>
    route.fulfill({ contentType: 'text/plain', body: 'reached' }),
  );
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/library.html`);

  const violations = await page.evaluate(async () => {
    const seen: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      seen.push(`${event.effectiveDirective} ${event.blockedURI}`),
    );
    // Images, yes, but not script access to the same server.
    await fetch('https://pbs.twimg.com/media/a.jpg').catch(() => undefined);
    const image = (src: string) =>
      new Promise<void>((resolve) => {
        const element = new Image();
        element.onload = element.onerror = () => resolve();
        element.src = src;
      });
    await image('https://pbs.twimg.com/media/b.jpg');
    await image('https://abs.twimg.com/c.png');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return seen;
  });

  expect(violations.sort()).toEqual([
    'connect-src https://pbs.twimg.com/media/a.jpg',
    'img-src https://abs.twimg.com/c.png',
  ]);
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

test("the browser blocks network requests from the library's search worker", async ({
  context,
  extensionId,
}) => {
  await context.route('https://x.com/**', (route) =>
    route.fulfill({ contentType: 'text/plain', body: 'reached' }),
  );
  const page = await context.newPage();
  const worker = page.waitForEvent('worker');
  await page.goto(`chrome-extension://${extensionId}/library.html`);

  const outcome = await (
    await worker
  ).evaluate(async () => {
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

  // Page-context script -> isolated content script -> background worker. The
  // content script also reports the theme the page shows, for the library
  // (docs/SPEC.md, section 10). The two race, so their order is not checked.
  await expect
    .poll(async () =>
      (await serviceWorker.evaluate(recorded)).sort((a, b) =>
        String(a.type).localeCompare(String(b.type)),
      ),
    )
    .toEqual([
      { type: 'content/ready', url: 'https://x.com/home' },
      { type: 'theme/seen', url: 'https://x.com/home' },
    ]);

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
    // The interceptor's wrapper is a proxy of the native function: it prints as
    // native code, though without the name. See docs/SPEC.md, section 7.1.
    fetchSource: 'function () { [native code] }',
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
