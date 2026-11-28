import type { BrowserContext, Page, Worker } from '@playwright/test';
import { homeTimeline, postEntry, rawPost } from '../fixtures/posts';
import { backToLibrary, expect, openSettings, test } from './fixtures';

/** The tag prompt after a bookmark or like on X (DESIGN, 4.3). */

const VIEWER = '9000000000000000001';

const article = (id: string, text: string) => `
  <article data-testid="tweet" tabindex="0" data-post="${id}">
    <div data-testid="User-Name">
      <span>Example User</span><span>@example_user</span>
      <a href="/example_user/status/${id}"><time datetime="2024-01-01T12:00:00.000Z">Jan 1</time></a>
    </div>
    <div data-testid="tweetText">${text}</div>
    <div role="group">
      <div><button data-testid="like">like</button></div>
      <div style="display: flex">
        <div><button data-testid="bookmark">bookmark</button></div>
      </div>
    </div>
  </article>`;

/** A stand-in for x.com that sends API requests on demand, and notes keys that reach it. */
const STAND_IN_PAGE = `<!doctype html>
<html>
  <head>
    <script>
      window.observed = [];
      window.addEventListener('keydown', (event) => window.observed.push(event.key), true);
      window.request = (method, url, body) =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest();
          request.open(method, url);
          request.onload = () => resolve(request.status);
          request.send(body);
        });
    </script>
    <title>stand-in</title>
  </head>
  <body style="background: rgb(255, 255, 255)">
    <main data-testid="primaryColumn">
      ${article('101', 'Seen in a timeline')}
      ${article('102', 'Only on the page')}
    </main>
  </body>
</html>`;

const RESPONSES: Record<string, unknown> = {
  HomeTimeline: homeTimeline([postEntry(rawPost({ id: '101', text: 'Seen in a timeline' }), '1')]),
  CreateBookmark: { data: { tweet_bookmark_put: 'Done' } },
  FavoriteTweet: { data: { favorite_tweet: 'Done' } },
};

async function serveStandIn(context: BrowserContext) {
  await context.addCookies([
    { name: 'twid', value: `u%3D${VIEWER}`, domain: 'x.com', path: '/', secure: true },
  ]);
  await context.route('https://x.com/**', (route) => {
    const op = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return op in RESPONSES
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(RESPONSES[op]) })
      : route.fulfill({ contentType: 'text/html', body: STAND_IN_PAGE });
  });
}

type StandIn = {
  request(method: string, url: string, body?: string): Promise<number>;
  observed: string[];
};

/** What X's own button sends when a post is bookmarked or liked. */
function change(page: Page, op: string, postId: string) {
  const body = JSON.stringify({ variables: { tweet_id: postId }, queryId: 'q' });
  return page.evaluate(
    ([target, sent]) => (window as unknown as StandIn).request('POST', target!, sent),
    [`/i/api/graphql/q/${op}`, body],
  );
}

interface DomNode {
  nodeName: string;
  nodeValue: string;
  backendNodeId: number;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
}

/** The page's DOM including closed shadow roots, which only the debugger can see into. */
async function shadowNodes(page: Page): Promise<DomNode[]> {
  const client = await page.context().newCDPSession(page);
  const { root } = (await client.send('DOM.getDocument', { depth: -1, pierce: true })) as {
    root: DomNode;
  };
  await client.detach();
  const found: DomNode[] = [];
  const walk = (node: DomNode, inShadow: boolean) => {
    if (inShadow) found.push(node);
    for (const child of node.children ?? []) walk(child, inShadow);
    for (const shadow of node.shadowRoots ?? []) walk(shadow, true);
  };
  walk(root, false);
  return found;
}

const attribute = (node: DomNode, name: string) => {
  const index = node.attributes?.indexOf(name) ?? -1;
  return index >= 0 && index % 2 === 0 ? node.attributes![index + 1] : undefined;
};

const textOf = (node: DomNode): string =>
  node.nodeName === '#text' ? node.nodeValue : (node.children ?? []).map(textOf).join('');

/** The prompt's text and buttons, or undefined while none shows. */
async function prompt(page: Page): Promise<string | undefined> {
  const toast = (await shadowNodes(page)).find(
    (node) => attribute(node, 'role') === 'status' && attribute(node, 'class') === 'toast',
  );
  return toast ? textOf(toast) : undefined;
}

/** Clicks a button in a closed shadow root, named by its text or label. */
async function press(page: Page, name: string) {
  const button = (await shadowNodes(page)).find(
    (node) =>
      node.nodeName === 'BUTTON' &&
      (textOf(node) === name || attribute(node, 'aria-label') === name),
  );
  if (!button) throw new Error(`no ${name} button`);
  const client = await page.context().newCDPSession(page);
  const { model } = (await client.send('DOM.getBoxModel', {
    backendNodeId: button.backendNodeId,
  })) as { model: { content: number[] } };
  await client.detach();
  const [x1, y1, , , x2, y2] = model.content as [number, number, number, number, number, number];
  await page.mouse.click((x1 + x2) / 2, (y1 + y2) / 2);
}

/** The accessible name of every tag button, in page order. */
async function tagButtons(page: Page): Promise<string[]> {
  return (await shadowNodes(page))
    .filter((node) => node.nodeName === 'BUTTON' && attribute(node, 'aria-haspopup') === 'dialog')
    .map((node) => attribute(node, 'aria-label') ?? '');
}

const popoverOpen = async (page: Page) =>
  (await shadowNodes(page)).some((node) => attribute(node, 'role') === 'dialog');

async function likes(serviceWorker: Worker): Promise<string[]> {
  return serviceWorker.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open('xorganize');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const all = request.result.transaction('posts').objectStore('posts').getAll();
          all.onsuccess = () =>
            resolve(
              (all.result as Array<{ id: string; isLike: number }>)
                .filter((post) => post.isLike === 1)
                .map((post) => post.id),
            );
        };
      }),
  );
}

async function openSite(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.goto('https://x.com/home');
  await site.evaluate(() =>
    (window as unknown as StandIn).request('GET', '/i/api/graphql/q/HomeTimeline?variables=%7B%7D'),
  );
  await expect.poll(() => tagButtons(site)).toEqual(['Tag', 'Tag']);
  return site;
}

const SHOWN = 'Saved to libraryAdd tags';

test('a bookmark on X offers tags, and Add tags opens the popover on the post', async ({
  context,
}) => {
  await serveStandIn(context);
  const site = await openSite(context);
  expect(await prompt(site)).toBeUndefined();

  await change(site, 'CreateBookmark', '101');
  await expect.poll(() => prompt(site)).toBe(SHOWN);

  await press(site, 'Add tags');
  await expect.poll(() => prompt(site)).toBeUndefined();
  await expect.poll(() => popoverOpen(site)).toBe(true);
  await site.keyboard.type('rust');
  await site.keyboard.press('Enter');
  await site.keyboard.press('Escape');
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: rust', 'Tag']);
  expect(await popoverOpen(site)).toBe(false);
  // What was typed into the popover stayed from the page.
  expect(await site.evaluate(() => (window as unknown as StandIn).observed)).toEqual([]);
});

test('a like offers tags only once turned on in Settings, and the prompt can be dismissed', async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  await serveStandIn(context);
  const site = await openSite(context);

  // Off at first: the like is stored, and nothing is offered.
  await change(site, 'FavoriteTweet', '102');
  await expect.poll(() => likes(serviceWorker)).toEqual(['102']);
  expect(await prompt(site)).toBeUndefined();

  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await openSettings(library);
  const bookmarking = library.getByRole('switch', { name: 'Prompt for tags after bookmarking' });
  const liking = library.getByRole('switch', { name: 'Prompt for tags after liking' });
  await expect(bookmarking).toBeChecked();
  await expect(liking).not.toBeChecked();
  await liking.check();
  await backToLibrary(library);

  await site.bringToFront();
  await change(site, 'FavoriteTweet', '101');
  await expect.poll(() => prompt(site)).toBe(SHOWN);
  await press(site, 'Dismiss');
  await expect.poll(() => prompt(site)).toBeUndefined();
  expect(await popoverOpen(site)).toBe(false);
});
