import type { BrowserContext, Page } from '@playwright/test';
import {
  bookmarksTimeline,
  cursorEntry,
  homeTimeline,
  likesTimeline,
  photo,
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
  <body style="background: rgb(0, 0, 0)">
    <main>
      <!-- A post that is on the page but never arrives in any API response below. -->
      <article data-testid="tweet">
        <div data-testid="User-Name">
          <span>Page Author</span><span>@page_author</span>
          <a href="/page_author/status/501"><time datetime="2024-03-01T10:00:00.000Z">Mar 1</time></a>
        </div>
        <div data-testid="tweetText">Shown on the page only</div>
      </article>
    </main>
  </body>
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

async function serveStandIn(context: BrowserContext, responses = RESPONSES) {
  await context.addCookies([
    { name: 'twid', value: `u%3D${VIEWER}`, domain: 'x.com', path: '/', secure: true },
  ]);
  await context.route('https://x.com/**', (route) => {
    const op = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return op in responses
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(responses[op]) })
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

/** A source in the library's sidebar, by its label. */
const source = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^${label} [\\d,]+$`) });

/** The posts a source shows, in order. */
async function texts(page: Page, label: string): Promise<string[]> {
  await source(page, label).click();
  await expect(source(page, label)).toHaveAttribute('aria-pressed', 'true');
  return page.locator('.posts .post__text').allTextContents();
}

/** How many posts each source holds, as the sidebar shows. */
async function counts(page: Page): Promise<Record<string, string>> {
  const items = await page
    .getByRole('region', { name: 'Sources' })
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => [
        button.querySelector('.sidebar__label')?.textContent ?? '',
        button.querySelector('.sidebar__count')?.textContent ?? '',
      ]),
    );
  return Object.fromEntries(items);
}

const totals = (all: number, bookmarks: number, likes: number, tagged = 0) => ({
  All: String(all),
  Bookmarks: String(bookmarks),
  Likes: String(likes),
  'Tagged only': String(tagged),
  Untagged: String(all - tagged),
});

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
  await expect.poll(() => counts(library)).toEqual(totals(3, 3, 1));
  await expect
    .poll(() => texts(library, 'Bookmarks'))
    .toEqual([
      'Bookmark three, also liked',
      'Bookmark two',
      'Bookmark one <b>not markup</b>', // shown as text, never as markup
    ]);

  // The account's own likes load. Someone else's are not stored.
  await timeline(site, 'Likes', { userId: VIEWER });
  await expect.poll(() => counts(library)).toEqual(totals(5, 3, 3));
  await timeline(site, 'Likes', { userId: SOMEONE_ELSE });

  // The user bookmarks and likes a post seen elsewhere, and removes two others.
  await timeline(site, 'HomeTimeline');
  await change(site, 'CreateBookmark', '401');
  await change(site, 'FavoriteTweet', '401');
  await change(site, 'DeleteBookmark', '102');
  await change(site, 'UnfavoriteTweet', '301');

  // A post in both sources is counted once in each, and once in All.
  await expect.poll(() => counts(library)).toEqual(totals(4, 3, 3));
  await expect
    .poll(() => texts(library, 'Bookmarks'))
    .toEqual(['Seen at home', 'Bookmark three, also liked', 'Bookmark one <b>not markup</b>']);
  // Likes: the one just made, then those with a place in the likes timeline, then
  // the one known to be liked only because the bookmarks timeline said so.
  await expect
    .poll(() => texts(library, 'Likes'))
    .toEqual(['Seen at home', 'Like two', 'Bookmark three, also liked']);

  // The user likes a post that never arrived from the API: it is read from the page.
  await change(site, 'FavoriteTweet', '501');
  await expect.poll(() => counts(library)).toEqual(totals(5, 3, 4));
  await expect
    .poll(() => texts(library, 'Likes'))
    .toEqual(['Shown on the page only', 'Seen at home', 'Like two', 'Bookmark three, also liked']);
  await expect(library.getByText('Page Author')).toBeVisible();
  await expect(library.getByText('@page_author · Mar 1, 2024')).toBeVisible();

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

test('finds posts by their text and author, and keeps up with new ones', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const site = await context.newPage();
  await site.goto('https://x.com/i/bookmarks');
  await timeline(site, 'Bookmarks');
  await timeline(site, 'Likes', { userId: VIEWER });
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect.poll(() => counts(library)).toEqual(totals(5, 3, 3));
  const status = library.getByRole('status');
  const listed = () => library.locator('.posts .post__text').allTextContents();

  // `/` goes to the search box, unless it is typed into a field.
  await library.locator('body').press('/');
  const search = library.getByRole('searchbox', { name: 'Search posts' });
  await expect(search).toBeFocused();

  // Any part of a word, ignoring case, every word in any order.
  await library.keyboard.type('BOOKMARK');
  await expect(status).toHaveText('3 posts');
  await expect(search).toHaveValue('BOOKMARK');
  await search.fill('two kmar');
  await expect.poll(listed).toEqual(['Bookmark two']);
  await expect(status).toHaveText('1 post');

  // By author, alone or with text, within a source.
  await search.fill('@another');
  await expect.poll(listed).toEqual(['Like two']);
  await expect(status).toHaveText('1 post');
  await search.fill('one');
  await source(library, 'Likes').click();
  await expect.poll(listed).toEqual(['Like one']);
  await expect(status).toHaveText('1 post');

  // A post stored while searching is found at once.
  await source(library, 'All').click();
  await search.fill('home');
  await expect(library.getByRole('heading', { name: 'No posts match' })).toBeVisible();
  await timeline(site, 'HomeTimeline');
  await change(site, 'CreateBookmark', '401');
  await expect.poll(listed).toEqual(['Seen at home']);
  await expect(status).toHaveText('1 post');

  // Clearing the filters clears the search too.
  await search.fill('nothing like this');
  await library.getByRole('button', { name: 'Clear filters' }).click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveText('6 posts');
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

  await expect.poll(() => counts(library)).toEqual(totals(3, 3, 1));
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

// Placeholders on X's image host. Requests for them are answered by the test.
const AVATAR = 'https://pbs.twimg.com/profile_images/1/avatar_normal.jpg';
const X_PHOTO = {
  type: 'photo',
  url: 'https://t.example/media1',
  media_url_https: 'https://pbs.twimg.com/media/photo1.jpg',
  ext_alt_text: 'A placeholder photo',
};
const X_VIDEO = {
  type: 'video',
  url: 'https://t.example/video1',
  media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still1.jpg',
  video_info: {
    variants: [{ content_type: 'video/mp4', bitrate: 1, url: 'https://video.twimg.com/v1.mp4' }],
  },
};
const X_SENSITIVE = { ...X_PHOTO, media_url_https: 'https://pbs.twimg.com/media/photo2.jpg' };

/** A 1×1 PNG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test('shows images from X without cookies or a referrer, and none once turned off', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context, {
    Bookmarks: bookmarksTimeline([
      postEntry(
        rawPost({
          id: '603',
          text: 'Photo and video',
          avatarUrl: AVATAR,
          media: [X_PHOTO, X_VIDEO],
        }),
        '9603',
      ),
      postEntry(
        rawPost({
          id: '602',
          text: 'Sensitive',
          avatarUrl: AVATAR,
          sensitive: true,
          media: [X_SENSITIVE],
        }),
        '9602',
      ),
      // Avatar and photo on another host: never loaded.
      postEntry(rawPost({ id: '601', text: 'Elsewhere', media: [photo()] }), '9601'),
    ]),
  });
  // A cookie X's image server could read, if the browser sent it.
  await context.addCookies([
    {
      name: 'tracker',
      value: 'set',
      domain: '.twimg.com',
      path: '/',
      secure: true,
      sameSite: 'None',
    },
  ]);
  const requests: Array<{ url: string; headers: Record<string, string> }> = [];
  await context.route('https://pbs.twimg.com/**', async (route) => {
    const headers = await route.request().allHeaders();
    requests.push({ url: route.request().url(), headers });
    await route.fulfill({
      contentType: 'image/png',
      body: PIXEL,
      headers: { 'access-control-allow-origin': headers.origin ?? '' },
    });
  });

  const site = await context.newPage();
  await site.goto('https://x.com/i/bookmarks');
  await timeline(site, 'Bookmarks');
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(library.locator('.post')).toHaveCount(3);

  const card = (text: string) => library.locator('.post', { hasText: text });
  const loaded = (text: string) =>
    card(text)
      .locator('img')
      .evaluateAll((images) =>
        images.map((image) => [
          (image as HTMLImageElement).currentSrc,
          (image as HTMLImageElement).naturalWidth,
        ]),
      );

  // Avatar, photo at the small size, and the video's still. Never the video file.
  await expect
    .poll(() => loaded('Photo and video'))
    .toEqual([
      [AVATAR, 1],
      ['https://pbs.twimg.com/media/photo1.jpg?name=small', 1],
      [X_VIDEO.media_url_https, 1],
    ]);
  await expect(card('Photo and video').getByText('Video', { exact: true })).toBeVisible();
  await expect(
    card('Photo and video').getByRole('img', { name: 'A placeholder photo' }),
  ).toBeVisible();

  // Sensitive media waits to be asked for.
  expect(await loaded('Sensitive')).toEqual([[AVATAR, 1]]);
  await card('Sensitive').getByRole('button', { name: 'Show sensitive media' }).click();
  await expect
    .poll(() => loaded('Sensitive'))
    .toEqual([
      [AVATAR, 1],
      ['https://pbs.twimg.com/media/photo2.jpg?name=small', 1],
    ]);

  // Nothing from any other host, and an initial in place of the avatar.
  expect(await loaded('Elsewhere')).toEqual([]);
  await expect(card('Elsewhere').locator('.avatar--placeholder')).toHaveText('E');
  await expect(card('Elsewhere').getByText('1 attachment')).toBeVisible();

  // Every request carried the image's address and nothing that identifies the user.
  expect(requests.length).toBeGreaterThan(0);
  for (const { headers } of requests) {
    expect(headers.cookie).toBeUndefined();
    expect(headers.referer).toBeUndefined();
    expect(headers.origin).toBe(`chrome-extension://${extensionId}`);
  }

  // Turned off, no image is requested, and that survives a reload.
  await library.getByRole('checkbox', { name: /Show images from X/ }).uncheck();
  await expect(library.locator('img')).toHaveCount(0);
  const before = requests.length;
  await library.reload();
  await expect(library.locator('.post')).toHaveCount(3);
  await expect(library.getByRole('checkbox', { name: /Show images from X/ })).not.toBeChecked();
  await expect(library.locator('img')).toHaveCount(0);
  await expect(card('Photo and video').getByText('2 attachments')).toBeVisible();
  expect(requests.length).toBe(before);
});
