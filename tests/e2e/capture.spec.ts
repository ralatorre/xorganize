import { readFile } from 'node:fs/promises';
import type { BrowserContext } from '@playwright/test';
import type { DiagnosticsReport } from '@/src/diagnostics/report';
import {
  MARKER,
  VIEWER_ID,
  bookmarksResponse,
  createBookmarkRequest,
  createBookmarkResponse,
  likesResponse,
} from '../fixtures/timeline';
import { expect, test, type Build } from './fixtures';

const variables = (value: unknown) => encodeURIComponent(JSON.stringify(value));

/**
 * A stand-in for x.com. Its first script behaves like a site trying to detect
 * extensions; its second behaves like the site's client, making the requests
 * the extension is interested in and recording exactly what it got back.
 */
const STAND_IN_PAGE = `<!doctype html>
<html>
  <head>
    <script>
      window.observed = [];
      window.addEventListener('message', (event) => {
        window.observed.push('message ' + JSON.stringify(event.data));
      });
      window.addEventListener('unhandledrejection', (event) => {
        window.observed.push('unhandledrejection ' + event.reason);
      });
      window.addEventListener('error', (event) => {
        window.observed.push('error ' + event.message);
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
    </script>
    <script>
      const xhr = (method, url, body, responseType) =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest();
          request.open(method, url);
          if (responseType) request.responseType = responseType;
          request.onload = () =>
            resolve(responseType === 'json' ? JSON.stringify(request.response) : request.responseText);
          request.send(body);
        });

      window.results = (async () => {
        const results = {};
        const bookmarks = await fetch('/i/api/graphql/q1/Bookmarks?variables=${variables({ count: 20 })}');
        results.bookmarksStatus = bookmarks.status;
        results.bookmarks = await bookmarks.text();
        results.likes = await xhr('GET', '/i/api/graphql/q2/Likes?variables=${variables({ userId: VIEWER_ID })}');
        results.createBookmark = await xhr(
          'POST',
          '/i/api/graphql/q3/CreateBookmark',
          ${JSON.stringify(JSON.stringify(createBookmarkRequest))},
          'json',
        );
        results.failed = await fetch('/i/api/graphql/q4/Bookmarks?fail=1').then(
          () => 'resolved',
          (error) => 'rejected ' + error.name,
        );
        results.unrelated = await (await fetch('/unrelated.json')).text();
        results.badCall = await Promise.resolve()
          .then(() => fetch({ toString() { throw new Error('page error'); } }))
          .then(() => 'resolved', (error) => 'rejected ' + error.message);
        return results;
      })();

      window.inspect = () => {
        const describe = (holder, name) => {
          const descriptor = Object.getOwnPropertyDescriptor(holder, name);
          return {
            source: Function.prototype.toString.call(descriptor.value),
            name: descriptor.value.name,
            length: descriptor.value.length,
            flags: [descriptor.writable, descriptor.enumerable, descriptor.configurable],
          };
        };
        return {
          fetch: describe(window, 'fetch'),
          open: describe(XMLHttpRequest.prototype, 'open'),
          send: describe(XMLHttpRequest.prototype, 'send'),
          globals: Object.keys(window).filter((key) => /xorganize|wxt/i.test(key)),
          htmlAttributes: document.documentElement.getAttributeNames(),
        };
      };
    </script>
    <title>stand-in</title>
  </head>
  <body>
    <main data-testid="primaryColumn">
      <article data-testid="tweet">
        <div data-testid="User-Name">${MARKER} name</div>
        <div data-testid="tweetText">${MARKER} text</div>
        <div role="group"><button data-testid="bookmark"></button></div>
      </article>
    </main>
  </body>
</html>`;

async function serveStandIn(context: BrowserContext) {
  await context.addCookies([
    { name: 'twid', value: `u%3D${VIEWER_ID}`, domain: 'x.com', path: '/', secure: true },
  ]);
  await context.route('https://x.com/**', (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

    if (url.searchParams.has('fail')) return route.abort();
    if (url.pathname.endsWith('/Bookmarks')) return json(bookmarksResponse);
    if (url.pathname.endsWith('/Likes')) return json(likesResponse);
    if (url.pathname.endsWith('/CreateBookmark')) return json(createBookmarkResponse);
    if (url.pathname === '/unrelated.json') return json({ unrelated: true });
    return route.fulfill({ contentType: 'text/html', body: STAND_IN_PAGE });
  });
}

type StandInWindow = {
  results: Promise<Record<string, unknown>>;
  inspect(): unknown;
  observed: string[];
};

for (const build of ['chrome-mv3', 'chrome-mv3-diagnostics'] satisfies Build[]) {
  test.describe(`${build}: the page`, () => {
    test.use({ build });

    test('gets exactly what the server sent and cannot tell it was observed', async ({
      context,
    }) => {
      await serveStandIn(context);
      const page = await context.newPage();
      await page.goto('https://x.com/home');

      const results = await page.evaluate(() => (window as unknown as StandInWindow).results);
      expect(results).toEqual({
        bookmarksStatus: 200,
        bookmarks: JSON.stringify(bookmarksResponse),
        likes: JSON.stringify(likesResponse),
        createBookmark: JSON.stringify(createBookmarkResponse),
        failed: 'rejected TypeError',
        unrelated: JSON.stringify({ unrelated: true }),
        badCall: 'rejected page error',
      });

      // Give anything asynchronous a chance to show itself.
      await page.waitForTimeout(500);
      const native = (name: string, length: number) => ({
        // A proxy of a native function prints as native code, without the name.
        source: 'function () { [native code] }',
        name,
        length,
        flags: [true, true, true],
      });
      expect(await page.evaluate(() => (window as unknown as StandInWindow).inspect())).toEqual({
        fetch: native('fetch', 1),
        open: native('open', 2),
        send: native('send', 0),
        globals: [],
        htmlAttributes: [],
      });
      expect(await page.evaluate(() => (window as unknown as StandInWindow).observed)).toEqual([]);
    });
  });
}

test.describe('diagnostics build', () => {
  test.use({ build: 'chrome-mv3-diagnostics' });

  test('records the structure of what it saw, and none of the content', async ({
    context,
    extensionId,
  }) => {
    await serveStandIn(context);
    const site = await context.newPage();
    await site.goto('https://x.com/home');
    await site.evaluate(() => (window as unknown as StandInWindow).results);

    const library = await context.newPage();
    await library.goto(`chrome-extension://${extensionId}/library.html`);
    await expect(library.getByRole('rowheader', { name: 'CreateBookmark' })).toBeVisible();
    await expect(library.getByRole('row', { name: /^Bookmarks 1 fetch 5 3$/ })).toBeVisible();
    await expect(library.getByRole('row', { name: /^Likes 1 xhr 5 3$/ })).toBeVisible();

    // The page-level facts are recorded shortly after the last response.
    await site.waitForTimeout(2000);

    const downloading = library.waitForEvent('download');
    await library.getByRole('button', { name: 'Save report' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/^xorganize-diagnostics-\d{4}-\d\d-\d\d\.json$/);
    const text = await readFile(await download.path(), 'utf8');
    const report = JSON.parse(text) as DiagnosticsReport;

    // Nothing personal: no post text, names, handles, cursors, ids or query ids.
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain(VIEWER_ID);
    expect(text).not.toMatch(/\d{10,}/);

    const byName = Object.fromEntries(report.operations.map((item) => [item.op, item]));
    expect(Object.keys(byName).sort()).toEqual(['Bookmarks', 'CreateBookmark', 'Likes']);

    expect(byName.Bookmarks).toMatchObject({
      responses: 1,
      transports: ['fetch'],
      hosts: ['x.com'],
      methods: ['GET'],
      statuses: [200],
      entriesTotal: 5,
      tweetResultsTotal: 3,
      postEntriesTotal: 3,
      entryIdPatterns: ['cursor-bottom-<n>', 'cursor-top-<n>', 'tweet-<n>'],
      postSortIndexDescending: { yes: 1, no: 0 },
      sortIndexIsPostIdTotal: 0,
      bookmarked: { yes: 3, no: 0 },
      favorited: { yes: 0, no: 3 },
      variableKeys: ['.count'],
    });
    expect(byName.Likes).toMatchObject({
      transports: ['xhr'],
      variableKeys: ['.userId'],
      userIdIsViewer: { yes: 1, no: 0, unknown: 0 },
    });
    expect(byName.CreateBookmark).toMatchObject({
      transports: ['xhr'],
      methods: ['POST'],
      requestBodyKeys: ['.queryId', '.variables.tweet_id'],
      paths: { '.data.tweet_bookmark_put': ['string'] },
    });

    expect(report.environment).toEqual([
      {
        page: '/home',
        observations: 1,
        accountCookie: ['ok'],
        selectors: {
          primaryColumn: 1,
          post: 1,
          postText: 1,
          postAuthor: 1,
          postPermalinkTime: 0,
          postActionBar: 1,
          bookmarkButton: 1,
          removeBookmarkButton: 0,
          likeButton: 0,
          unlikeButton: 0,
          profileLink: 0,
        },
      },
    ]);
  });
});
