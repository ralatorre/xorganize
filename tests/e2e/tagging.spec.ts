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

/** The posts the library lists, in order. */
const listed = (library: Page) => library.locator('.posts .post__text').allTextContents();

/** A tag in the library's sidebar, by its label. */
const sidebarTag = (library: Page, label: string) =>
  library
    .getByRole('region', { name: 'Tags' })
    .getByRole('button', { name: new RegExp(`^${label} [\\d,]+$`) });

/** The tag chips on a library card, in order. */
const chips = (library: Page, text: string) =>
  library
    .locator('article.post', { hasText: text })
    .locator('.post__tags .chip:not(.chip--add)')
    .allTextContents();

/** Types each name into the open popover and applies it, then closes the popover. */
async function typeTags(page: Page, names: string[]) {
  await expect.poll(() => popoverOpen(page)).toBe(true);
  for (const name of names) {
    await page.keyboard.type(name);
    // Wait for the suggestions, so Enter takes exactly the typed name.
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Escape');
  await expect.poll(() => popoverOpen(page)).toBe(false);
}

/** Tags a post from its button on the page, one name at a time. */
async function tagFromPage(site: Page, postId: string, names: string[]) {
  await tagHost(site, postId).click();
  await typeTags(site, names);
}

test('a post tagged on X can be found in the library by its tags', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const site = await openSite(context);
  await tagFromPage(site, '101', ['Rust', 'to read']);
  await tagFromPage(site, '102', ['Rust', 'dev/web']);

  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);

  // Every tag with its count; a `/` puts a tag in a group.
  await expect(sidebarTag(library, 'Rust')).toContainText('2');
  await expect(sidebarTag(library, 'to read')).toContainText('1');
  await expect(sidebarTag(library, 'web')).toBeVisible();
  await library.getByRole('button', { name: 'dev group' }).click();
  await expect(sidebarTag(library, 'web')).toHaveCount(0);

  // Tagged without being bookmarked or liked.
  await expect(library.getByRole('button', { name: /^Tagged only 2$/ })).toBeVisible();
  await expect(library.getByRole('button', { name: /^Bookmarks 0$/ })).toBeVisible();

  // Each card carries its tags, in the order they were applied.
  await expect.poll(() => chips(library, 'Seen in a timeline')).toEqual(['Rust', 'to read']);

  // One tag, then a second added with Ctrl: all of them, then any of them.
  await sidebarTag(library, 'Rust').click();
  await expect.poll(() => listed(library)).toEqual(['Only on the page', 'Seen in a timeline']);
  await sidebarTag(library, 'to read').click({ modifiers: ['Control'] });
  await expect(library.getByRole('status')).toHaveText('1 post');
  await expect.poll(() => listed(library)).toEqual(['Seen in a timeline']);
  await library.getByRole('radio', { name: 'Any' }).check();
  await expect(library.getByRole('status')).toHaveText('2 posts');
  await library.getByRole('button', { name: 'Remove filter Rust' }).click();
  await expect(library.getByRole('status')).toHaveText('1 post');

  // A tag added on X shows at once.
  await tagFromPage(site, '102', ['to read']);
  await expect(library.getByRole('status')).toHaveText('2 posts');
  await expect(sidebarTag(library, 'to read')).toContainText('2');

  // A filter that matches nothing offers a way back.
  await library.getByRole('button', { name: /^Bookmarks 0$/ }).click();
  await expect(library.getByRole('heading', { name: 'No posts match' })).toBeVisible();
  await library.getByRole('button', { name: 'Clear filters' }).click();
  await expect(library.getByRole('status')).toHaveText('2 posts');

  // Ordered by post date: the newer ID first.
  await library.getByRole('combobox', { name: 'Sort:' }).selectOption('posted');
  await expect.poll(() => listed(library)).toEqual(['Only on the page', 'Seen in a timeline']);

  // Found by typing its tag, and by its text.
  const search = library.getByRole('searchbox', { name: 'Search posts' });
  await search.fill('#"to read" #rus');
  await expect(library.getByRole('status')).toHaveText('2 posts');
  await search.fill('#"dev/web"');
  await expect.poll(() => listed(library)).toEqual(['Only on the page']);
  await search.fill('timeline #rust');
  await expect.poll(() => listed(library)).toEqual(['Seen in a timeline']);
});

test('tags are renamed, recoloured, merged and deleted in the library, and x.com follows', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const site = await openSite(context);
  await tagFromPage(site, '101', ['Rust', 'to read']);
  await tagFromPage(site, '102', ['Rust']);
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(sidebarTag(library, 'Rust')).toContainText('2');

  // Rename, from the tag's ⋯ button. Open tabs on x.com show the new name.
  await library.getByRole('button', { name: 'Manage Rust' }).click();
  await library.getByRole('button', { name: 'Rename' }).click();
  await library.getByRole('textbox', { name: 'New name' }).fill('Rust lang');
  await library.getByRole('button', { name: 'Save' }).click();
  await expect(sidebarTag(library, 'Rust lang')).toContainText('2');
  await expect
    .poll(() => tagButtons(site))
    .toEqual(['Tags: Rust lang, to read', 'Tags: Rust lang']);

  // A name another tag has is refused, and Esc leaves it as it was.
  await library.getByRole('button', { name: 'Manage to read' }).click();
  await library.getByRole('button', { name: 'Rename' }).click();
  await library.getByRole('textbox', { name: 'New name' }).fill('rust LANG');
  await library.getByRole('button', { name: 'Save' }).click();
  await expect(library.getByRole('alert')).toHaveText(
    'Another tag has that name. Merge into it instead.',
  );
  await library.keyboard.press('Escape');
  await expect(library.getByRole('group', { name: 'Manage to read' })).toHaveCount(0);
  await expect(library.getByRole('button', { name: 'Manage to read' })).toBeFocused();

  // Another colour from the palette.
  await library.getByRole('button', { name: 'Manage to read' }).click();
  await library.getByRole('button', { name: 'Change colour' }).click();
  await library.getByRole('radio', { name: 'Pink' }).check();
  await expect(sidebarTag(library, 'to read').locator('.tag-dot')).toHaveCSS(
    'background-color',
    'rgb(249, 24, 128)',
  );
  await library.getByRole('button', { name: 'Done' }).click();

  // Merge: the posts move, and the tag goes.
  await library.getByRole('button', { name: 'Manage to read' }).click();
  await library.getByRole('button', { name: 'Merge into…' }).click();
  await library.getByRole('combobox', { name: 'Merge into' }).selectOption({ label: 'Rust lang' });
  await library.getByRole('button', { name: 'Merge', exact: true }).click();
  await expect(sidebarTag(library, 'to read')).toHaveCount(0);
  await expect(sidebarTag(library, 'Rust lang')).toContainText('2');
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust lang', 'Tags: Rust lang']);

  // Delete, from a right click: it asks first, and says what will happen.
  await sidebarTag(library, 'Rust lang').click({ button: 'right' });
  await library.getByRole('button', { name: 'Delete…' }).click();
  const dialog = library.getByRole('dialog', { name: 'Delete the tag “Rust lang”?' });
  await expect(dialog).toContainText(
    'It will be taken off 2 posts. 2 of them are in the library only because of this tag, and will leave it.',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(sidebarTag(library, 'Rust lang')).toBeVisible();

  await library.getByRole('button', { name: 'Delete…' }).click();
  await dialog.getByRole('button', { name: 'Delete tag' }).click();
  await expect(library.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
  await expect.poll(() => tagButtons(site)).toEqual(['Tag', 'Tag']);
});

test('cards are tagged, copied and removed, by pointer and by keyboard', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const site = await openSite(context);
  await tagFromPage(site, '101', ['Rust']);
  await tagFromPage(site, '102', ['go']);
  const library = await context.newPage();
  await library.goto(`chrome-extension://${extensionId}/library.html`);
  await expect.poll(() => listed(library)).toEqual(['Only on the page', 'Seen in a timeline']);

  // [+] opens the same popover as on x.com. What is typed there is not taken
  // for the library's shortcuts: `o` would open a tab, `j` would move.
  const pages = context.pages().length;
  await library
    .locator('article.post', { hasText: 'Seen in a timeline' })
    .getByRole('button', { name: 'Change tags' })
    .click();
  await typeTags(library, ['jot']);
  await expect.poll(() => chips(library, 'Seen in a timeline')).toEqual(['Rust', 'jot']);
  expect(context.pages()).toHaveLength(pages);
  await expect(
    library.locator('article.post', { hasText: 'Seen in a timeline' }).getByRole('button', {
      name: 'Change tags',
    }),
  ).toBeFocused();
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust, jot', 'Tags: go']);

  // j and k move between cards, t tags the focused one, o opens it on X.
  await library.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await library.keyboard.press('j');
  await expect(library.locator('article.post', { hasText: 'Only on the page' })).toBeFocused();
  await library.keyboard.press('j');
  await expect(library.locator('article.post', { hasText: 'Seen in a timeline' })).toBeFocused();
  await library.keyboard.press('j');
  await expect(library.locator('article.post', { hasText: 'Seen in a timeline' })).toBeFocused();
  await library.keyboard.press('k');
  await expect(library.locator('article.post', { hasText: 'Only on the page' })).toBeFocused();
  await library.keyboard.press('t');
  await typeTags(library, ['keys']);
  await expect.poll(() => chips(library, 'Only on the page')).toEqual(['go', 'keys']);

  const [opened] = await Promise.all([context.waitForEvent('page'), library.keyboard.press('o')]);
  await expect.poll(() => opened.url()).toBe('https://x.com/example_user/status/102');
  await opened.close();

  // ? lists the shortcuts.
  await library.keyboard.press('?');
  const help = library.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toContainText('Next post');
  await library.keyboard.press('j'); // a dialog is open: not a shortcut
  await library.keyboard.press('Escape');
  await expect(help).toHaveCount(0);

  // Copy link puts the post's address on the clipboard. Chromium will not let
  // a test read an extension's clipboard, so what is written is recorded on
  // the way through; the real clipboard still has to accept it.
  await library.evaluate(() => {
    const clipboard = navigator.clipboard;
    const write = clipboard.writeText.bind(clipboard);
    clipboard.writeText = (text: string) => {
      (window as unknown as { copied: string }).copied = text;
      return write(text);
    };
  });
  const card = library.locator('article.post', { hasText: 'Only on the page' });
  await card.getByRole('button', { name: 'More actions' }).click();
  await card.getByRole('button', { name: 'Copy link' }).click();
  await expect(card.getByRole('status')).toHaveText('Link copied');
  expect(await library.evaluate(() => (window as unknown as { copied: string }).copied)).toBe(
    'https://x.com/example_user/status/102',
  );

  // Remove from library asks first; the post and its tags go, here and on x.com.
  await card.getByRole('button', { name: 'Remove from library' }).click();
  const confirm = library.getByRole('dialog', { name: 'Remove this post from the library?' });
  await confirm.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(() => listed(library)).toEqual(['Seen in a timeline']);
  await expect(sidebarTag(library, 'go')).toContainText('0');
  await expect.poll(() => tagButtons(site)).toEqual(['Tags: Rust, jot', 'Tag']);
});
