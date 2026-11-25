import type { BrowserContext, Page, Worker } from '@playwright/test';
import { homeTimeline, postEntry, rawPost } from '../fixtures/posts';
import { expect, test } from './fixtures';

const VIEWER = '9000000000000000001';

/** An article shaped like X's: author line, permalink around the time, text, action bar. */
const article = (id: string, text: string, options: { ad?: boolean } = {}) => `
  <article data-testid="tweet" tabindex="0" data-post="${id}">
    <div data-testid="User-Name">
      <span>Example User</span><span>@example_user</span>
      ${options.ad ? '<span>Ad</span>' : `<a href="/example_user/status/${id}"><time datetime="2024-01-01T12:00:00.000Z">Jan 1</time></a>`}
    </div>
    <div data-testid="tweetText">${text}</div>
    <div role="group">
      <div><button data-testid="reply">reply</button></div>
      <div><button data-testid="like">like</button></div>
      <div style="display: flex">
        <div><button data-testid="bookmark">bookmark</button></div>
        <div><button>share</button></div>
      </div>
    </div>
  </article>`;

/**
 * A stand-in for x.com. Its first script listens as early and as widely as a
 * page can, for anything that would reveal typing or clicks in the
 * extension's controls, and stands in for X's own handlers: a click on an
 * article opens it, and single keys are shortcuts.
 */
const STAND_IN_PAGE = `<!doctype html>
<html>
  <head>
    <script>
      window.observed = [];
      for (const type of ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'paste']) {
        window.addEventListener(type, (event) => window.observed.push('window ' + type + ' ' + (event.key ?? '')), true);
        document.addEventListener(type, (event) => window.observed.push('document ' + type + ' ' + (event.key ?? '')));
      }
      document.addEventListener('click', (event) => {
        if (event.target.closest('article')) window.observed.push('opened ' + event.target.closest('article').dataset.post);
      });
      window.request = (method, url) =>
        new Promise((resolve) => {
          const request = new XMLHttpRequest();
          request.open(method, url);
          request.onload = () => resolve(request.status);
          request.send();
        });
    </script>
    <title>stand-in</title>
  </head>
  <body style="background: rgb(255, 255, 255)">
    <main data-testid="primaryColumn">
      ${article('101', 'Seen in a timeline')}
      ${article('900', 'Promoted', { ad: true })}
      ${article('102', 'Only on the page')}
    </main>
  </body>
</html>`;

async function serveStandIn(context: BrowserContext) {
  await context.addCookies([
    { name: 'twid', value: `u%3D${VIEWER}`, domain: 'x.com', path: '/', secure: true },
  ]);
  const home = homeTimeline([
    postEntry(rawPost({ id: '101', text: 'Seen in a timeline' }), '7001'),
  ]);
  await context.route('https://x.com/**', (route) =>
    route.request().url().includes('/HomeTimeline')
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(home) })
      : route.fulfill({ contentType: 'text/html', body: STAND_IN_PAGE }),
  );
}

interface DomNode {
  nodeName: string;
  nodeValue: string;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
}

/** The page's DOM including closed shadow roots, which only the debugger can see into. */
async function fullDom(page: Page): Promise<DomNode> {
  const client = await page.context().newCDPSession(page);
  const { root } = (await client.send('DOM.getDocument', { depth: -1, pierce: true })) as {
    root: DomNode;
  };
  await client.detach();
  return root;
}

function walk(node: DomNode, inShadow: boolean, visit: (node: DomNode, inShadow: boolean) => void) {
  visit(node, inShadow);
  for (const child of node.children ?? []) walk(child, inShadow, visit);
  for (const shadow of node.shadowRoots ?? []) walk(shadow, true, visit);
}

const attribute = (node: DomNode, name: string) => {
  const index = node.attributes?.indexOf(name) ?? -1;
  return index >= 0 && index % 2 === 0 ? node.attributes![index + 1] : undefined;
};

/** The accessible name of every tag button, in page order. */
async function tagButtons(page: Page): Promise<string[]> {
  const labels: string[] = [];
  walk(await fullDom(page), false, (node, inShadow) => {
    if (inShadow && node.nodeName === 'BUTTON' && attribute(node, 'aria-haspopup') === 'dialog') {
      labels.push(attribute(node, 'aria-label') ?? '');
    }
  });
  return labels;
}

async function popoverOpen(page: Page): Promise<boolean> {
  let open = false;
  walk(await fullDom(page), false, (node, inShadow) => {
    if (inShadow && attribute(node, 'role') === 'dialog') open = true;
  });
  return open;
}

/**
 * The host of the tag button in a post's action bar, just before the bookmark
 * button. Its content is in a closed shadow root, so it looks empty.
 */
const tagHost = (page: Page, postId: string) =>
  page.locator(
    `article[data-post="${postId}"] [role="group"] div:has(> div > [data-testid="bookmark"]) > div:empty`,
  );

const observed = (page: Page) =>
  page.evaluate(() => (window as unknown as { observed: string[] }).observed);

async function storedPosts(serviceWorker: Worker) {
  return serviceWorker.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
        const request = indexedDB.open('xorganize');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const all = request.result.transaction('posts').objectStore('posts').getAll();
          all.onsuccess = () =>
            resolve(
              (all.result as Array<Record<string, unknown>>).map(
                ({ id, hasTags, isBookmark, isLike, partial }) => ({
                  id,
                  hasTags,
                  isBookmark,
                  isLike,
                  partial,
                }),
              ),
            );
        };
      }),
  );
}

async function openSite(context: BrowserContext): Promise<Page> {
  const site = await context.newPage();
  await site.goto('https://x.com/home');
  await site.evaluate(() =>
    (window as unknown as { request(method: string, url: string): Promise<number> }).request(
      'GET',
      '/i/api/graphql/q/HomeTimeline?variables=%7B%7D',
    ),
  );
  await expect.poll(() => tagButtons(site)).toEqual(['Tag', 'Tag']);
  return site;
}

test('tags posts from the page, and the tags survive a reload', async ({
  context,
  serviceWorker,
}) => {
  await serveStandIn(context);
  const site = await openSite(context);

  // One button per post, before X's bookmark button, and none on the advert.
  await expect(tagHost(site, '900')).toHaveCount(0);
  await expect(tagHost(site, '101')).toHaveCount(1);

  // Click, type a new tag, Enter, Escape.
  await tagHost(site, '101').click();
  await expect.poll(() => popoverOpen(site)).toBe(true);
  await site.keyboard.type('Rust');
  await site.keyboard.press('Enter');
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust', 'Tag']);
  await site.keyboard.type('to read');
  await site.keyboard.press('Enter');
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust, to read', 'Tag']);
  await site.keyboard.press('Escape');
  await expect.poll(() => popoverOpen(site)).toBe(false);

  // A post never seen in a timeline is tagged from what the page shows, using the existing tag.
  await tagHost(site, '102').click();
  await site.keyboard.type('ru');
  await site.keyboard.press('Enter');
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust, to read', 'Tags: Rust']);
  await site.keyboard.press('Escape');

  // The page never saw a key, and never treated a click on the button as opening the post.
  expect(await observed(site)).toEqual([]);

  // Stored as tagged, and neither bookmarked nor liked.
  await expect
    .poll(async () =>
      (await storedPosts(serviceWorker)).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    )
    .toEqual([
      { id: '101', hasTags: 1, isBookmark: 0, isLike: 0, partial: false },
      { id: '102', hasTags: 1, isBookmark: 0, isLike: 0, partial: true },
    ]);

  await site.reload();
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust, to read', 'Tags: Rust']);

  // Removing the last tag of a post with no other reason to be kept removes it.
  await tagHost(site, '102').click();
  await site.keyboard.press('Backspace');
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust, to read', 'Tag']);
  await expect
    .poll(async () => (await storedPosts(serviceWorker)).map((post) => post.id))
    .toEqual(['101']);
});

test('opens from the keyboard, and gives focus back on close', async ({ context }) => {
  await serveStandIn(context);
  const site = await openSite(context);

  await site.locator('article[data-post="101"]').focus();
  await site.keyboard.press('Alt+t');
  await expect.poll(() => popoverOpen(site)).toBe(true);
  await site.keyboard.type('keyboard');
  await site.keyboard.press('Enter');
  await site.keyboard.press('Escape');

  await expect.poll(() => popoverOpen(site)).toBe(false);
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: keyboard', 'Tag']);
  // Focus is on the tag button again: the page sees only its host.
  expect(await site.evaluate(() => document.activeElement?.tagName)).toBe('DIV');
  // The page saw the Alt key go down on its own post, as with any key, and nothing after.
  expect(await observed(site)).toEqual(['window keydown Alt', 'document keydown Alt']);
});

test('a change in one tab shows in another', async ({ context }) => {
  await serveStandIn(context);
  const first = await openSite(context);
  const second = await openSite(context);

  await tagHost(first, '101').click();
  await first.keyboard.type('shared');
  await first.keyboard.press('Enter');

  await expect.poll(() => tagButtons(second)).toEqual(['Tags: shared', 'Tag']);
});

test('shows no buttons when no account is signed in', async ({ context }) => {
  await serveStandIn(context);
  await context.clearCookies();
  const site = await context.newPage();
  await site.goto('https://x.com/home');
  await site.waitForTimeout(500);
  expect(await tagButtons(site)).toEqual([]);
});
