import type { BrowserContext, Page } from '@playwright/test';
import {
  bookmarksTimeline,
  cursorEntry,
  homeTimeline,
  likesTimeline,
  postEntry,
  rawPost,
} from '../fixtures/posts';
import { expect, test } from './fixtures';

const VIEWER = '9000000000000000001';
const SOMEONE_ELSE = '9000000000000000002';

/** A stand-in for x.com that makes API requests on demand, the way the site's client does. */
const STAND_IN_PAGE = `<!doctype html>
<html>
  <head>
    <script>
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
  <body style="background: rgb(0, 0, 0)"><main>stand-in page</main></body>
</html>`;

const RESPONSES: Record<string, unknown> = {
  Bookmarks: bookmarksTimeline([
    postEntry(rawPost({ id: '103', text: 'Bookmark three, also liked', favorited: true }), '9003'),
    postEntry(rawPost({ id: '102', text: 'Bookmark two' }), '9002'),
    postEntry(rawPost({ id: '101', text: 'Bookmark one <b>not markup</b>' }), '9001'),
    cursorEntry('top', '9004'),
    cursorEntry('bottom', '9000'),
  ]),
  Likes: likesTimeline([
    postEntry(rawPost({ id: '302', text: 'Like two', handle: 'another_user' }), '8002'),
    postEntry(rawPost({ id: '301', text: 'Like one' }), '8001'),
  ]),
  HomeTimeline: homeTimeline([postEntry(rawPost({ id: '401', text: 'Seen at home' }), '7001')]),
  CreateBookmark: { data: { tweet_bookmark_put: 'Done' } },
  DeleteBookmark: { data: { tweet_bookmark_delete: 'Done' } },
  FavoriteTweet: { data: { favorite_tweet: 'Done' } },
  UnfavoriteTweet: { data: { unfavorite_tweet: 'Done' } },
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

type StandIn = { request(method: string, url: string, body?: string): Promise<number> };

function timeline(page: Page, op: string, variables: unknown = {}) {
  const url = `/i/api/graphql/q/${op}?variables=${encodeURIComponent(JSON.stringify(variables))}`;
  return page.evaluate((target) => (window as unknown as StandIn).request('GET', target), url);
}

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
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
}

/** Reads the on-page status line. It is in a closed shadow root, so this goes through the debugger. */
async function banner(page: Page): Promise<{ text: string; hidden: boolean } | undefined> {
  const client = await page.context().newCDPSession(page);
  const { root } = (await client.send('DOM.getDocument', { depth: -1, pierce: true })) as {
    root: DomNode;
  };
  await client.detach();

  const find = (node: DomNode, inShadow: boolean): DomNode | undefined => {
    if (inShadow && node.attributes?.includes('banner')) return node;
    for (const child of node.children ?? []) {
      const found = find(child, inShadow);
      if (found) return found;
    }
    for (const shadow of node.shadowRoots ?? []) {
      const found = find(shadow, true);
      if (found) return found;
    }
    return undefined;
  };
  const element = find(root, false);
  if (!element) return undefined;
  return {
    text: (element.children ?? []).map((child) => child.nodeValue).join(''),
    hidden: element.attributes?.includes('hidden') ?? false,
  };
}

const texts = (page: Page, list: string) =>
  page.getByRole('region', { name: list }).locator('.post__text').allTextContents();

test('captures bookmarks and likes as they load, and keeps up with changes', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const site = await context.newPage();
  await site.goto('https://x.com/i/bookmarks');
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(library.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();

  // A page of bookmarks loads.
  await timeline(site, 'Bookmarks');
  await expect
    .poll(() => banner(site))
    .toEqual({
      text: 'xorganize · 3 bookmarks captured',
      hidden: false,
    });
  await expect(library.getByText('3 bookmarks · 1 like')).toBeVisible();
  expect(await texts(library, 'Bookmarks')).toEqual([
    'Bookmark three, also liked',
    'Bookmark two',
    'Bookmark one <b>not markup</b>', // shown as text, never as markup
  ]);

  // The account's own likes load. Someone else's are not stored.
  await timeline(site, 'Likes', { userId: VIEWER });
  await expect(library.getByText('3 bookmarks · 3 likes')).toBeVisible();
  await timeline(site, 'Likes', { userId: SOMEONE_ELSE });

  // The user bookmarks and likes a post seen elsewhere, and removes two others.
  await timeline(site, 'HomeTimeline');
  await change(site, 'CreateBookmark', '401');
  await change(site, 'FavoriteTweet', '401');
  await change(site, 'DeleteBookmark', '102');
  await change(site, 'UnfavoriteTweet', '301');

  await expect(library.getByText('3 bookmarks · 3 likes')).toBeVisible();
  await expect
    .poll(() => texts(library, 'Bookmarks'))
    .toEqual(['Seen at home', 'Bookmark three, also liked', 'Bookmark one <b>not markup</b>']);
  await expect
    .poll(() => texts(library, 'Likes'))
    .toEqual(['Seen at home', 'Bookmark three, also liked', 'Like two']);

  // Each post links back to X and nowhere else.
  const links = await library
    .getByRole('link', { name: 'Open on X' })
    .evaluateAll((anchors) =>
      anchors.map((anchor) => [
        (anchor as HTMLAnchorElement).href,
        (anchor as HTMLAnchorElement).rel,
      ]),
    );
  expect(new Set(links.map(([, rel]) => rel))).toEqual(new Set(['noopener noreferrer']));
  expect(links.map(([href]) => href)).toContain('https://x.com/another_user/status/302');
  expect(links.every(([href]) => href!.startsWith('https://x.com/'))).toBe(true);

  // The status line belongs to the page it was shown on.
  await expect.poll(() => banner(site)).toMatchObject({ hidden: false });
  await site.evaluate(() => history.pushState({}, '', '/home'));
  await expect.poll(() => banner(site)).toMatchObject({ hidden: true });
});

test('keeps what it captured after the browser forgets the page', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const site = await context.newPage();
  await site.goto('https://x.com/i/bookmarks');
  await timeline(site, 'Bookmarks');
  await expect.poll(() => banner(site)).toMatchObject({ hidden: false });
  await site.close();

  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);

  await expect(library.getByText('3 bookmarks · 1 like')).toBeVisible();
});

test('captures nothing when no account is signed in', async ({ context, extensionId }) => {
  await serveStandIn(context);
  await context.clearCookies();
  const site = await context.newPage();
  await site.goto('https://x.com/i/bookmarks');
  await timeline(site, 'Bookmarks');
  await site.waitForTimeout(500);

  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);

  await expect(library.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
  expect(await banner(site)).toBeUndefined();
});
