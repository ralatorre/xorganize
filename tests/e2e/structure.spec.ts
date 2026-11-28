import type { BrowserContext, Page } from '@playwright/test';
import { expect, openSettings, test } from './fixtures';

const VIEWER = '9000000000000000001';
const SECOND = '9000000000000000002';
const DAY = Date.UTC(2026, 0, 2);

const AVATAR = 'https://pbs.twimg.com/profile_images/1/example_normal.jpg';

/** A 1×1 PNG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * A stand-in for x.com that shows only what identifies the signed-in account:
 * the link to its profile, and X's account button with its picture.
 */
const STAND_IN_PAGE = `<!doctype html>
<html>
  <head><title>stand-in</title></head>
  <body style="background: rgb(255, 255, 255)">
    <nav>
      <a data-testid="AppTabBar_Profile_Link" href="/example_user">Profile</a>
      <button data-testid="SideNav_AccountSwitcher_Button">
        <div data-testid="UserAvatar-Container-example_user"><img src="${AVATAR}" alt="" /></div>
      </button>
    </nav>
    <main data-testid="primaryColumn"></main>
  </body>
</html>`;

async function serveStandIn(context: BrowserContext) {
  await context.addCookies([
    { name: 'twid', value: `u%3D${VIEWER}`, domain: 'x.com', path: '/', secure: true },
  ]);
  await context.route('https://x.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: STAND_IN_PAGE }),
  );
  await context.route('https://pbs.twimg.com/**', async (route) => {
    const headers = await route.request().allHeaders();
    await route.fulfill({
      contentType: 'image/png',
      body: PIXEL,
      headers: { 'access-control-allow-origin': headers.origin ?? '' },
    });
  });
}

const post = (accountId: string, id: string, text: string, tagged = false) => ({
  accountId,
  id,
  url: `https://x.com/example_user/status/${id}`,
  text,
  createdAt: DAY,
  author: { handle: 'example_user', name: 'Example User' },
  media: [],
  links: [],
  sensitive: false,
  isBookmark: 1,
  isLike: 0,
  hasTags: tagged ? 1 : 0,
  bookmarkSort: id.padStart(30, '0'),
  partial: false,
  unavailable: false,
  firstSeenAt: DAY,
  lastSeenAt: DAY,
  savedAt: DAY,
});

const tag = (id: string, name: string) => ({
  accountId: VIEWER,
  id,
  name,
  nameKey: name,
  color: 0,
  createdAt: DAY,
  lastUsedAt: DAY,
});

/** Two posts and two tags for the viewer, and one post for a second account. */
const RECORDS = {
  posts: [
    post(VIEWER, '101', 'A post about rust', true),
    post(VIEWER, '102', 'A post about bread', true),
    post(SECOND, '201', 'A post of the second account'),
  ],
  tags: [tag('t-rust', 'rust'), tag('t-bread', 'bread')],
  postTags: [
    { accountId: VIEWER, postId: '101', tagId: 't-rust', taggedAt: DAY },
    { accountId: VIEWER, postId: '102', tagId: 't-bread', taggedAt: DAY },
  ],
  meta: [{ accountId: '', key: 'activeAccount', value: VIEWER }],
};

async function openSeeded(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/library.html`);
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible();
  await page.evaluate(
    (records) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('xorganize');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const names = Object.keys(records);
          const write = db.transaction(names, 'readwrite');
          for (const name of names) {
            for (const record of records[name as keyof typeof records]) {
              write.objectStore(name).put(record);
            }
          }
          write.oncomplete = () => {
            db.close();
            resolve();
          };
          write.onerror = () => reject(write.error);
        };
      }),
    RECORDS,
  );
  await page.reload();
  await expect(page.locator('.posts .post__text')).toHaveCount(2);
}

const texts = (page: Page) => page.locator('.posts .post__text');

test('names the account from x.com, and switches between the accounts in this browser', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const library = await context.newPage();
  await openSeeded(library, extensionId);

  // Until x.com has been seen, the account is named by its ID.
  const menu = library.getByRole('button', { name: 'X account ···0001' });
  await expect(menu).toBeVisible();

  const site = await context.newPage();
  await site.goto('https://x.com/home');
  const named = library.getByRole('button', { name: '@example_user' });
  await expect(named).toBeVisible();
  await expect(named.locator('img')).toHaveAttribute('src', AVATAR);
  await expect(named.locator('img')).toHaveAttribute('crossorigin', 'anonymous');
  await expect(named.locator('img')).toHaveAttribute('referrerpolicy', 'no-referrer');

  // The menu lists both accounts, the shown one ticked; Esc puts focus back.
  await named.click();
  const accounts = library.getByRole('menu', { name: 'X account: @example_user' });
  const shown = accounts.getByRole('menuitemradio', { name: /@example_user/ });
  await expect(shown).toHaveAttribute('aria-checked', 'true');
  await expect(shown).toBeFocused();
  await library.keyboard.press('ArrowDown');
  await expect(accounts.getByRole('menuitemradio', { name: /···0002/ })).toBeFocused();
  await library.keyboard.press('Escape');
  await expect(accounts).toBeHidden();
  await expect(named).toBeFocused();

  // Choosing the other account shows its library.
  await named.click();
  await accounts.getByRole('menuitemradio', { name: /···0002/ }).click();
  await expect(texts(library)).toHaveText(['A post of the second account']);
  await expect(library.getByRole('button', { name: 'X account ···0002' })).toBeFocused();
});

test('shows no picture of the account once images from X are off', async ({
  context,
  extensionId,
}) => {
  await serveStandIn(context);
  const library = await context.newPage();
  await openSeeded(library, extensionId);
  const site = await context.newPage();
  await site.goto('https://x.com/home');
  const named = library.getByRole('button', { name: '@example_user' });
  await expect(named.locator('img')).toHaveCount(1);

  await openSettings(library);
  await library.getByRole('switch', { name: 'Show images from X' }).uncheck();
  await expect(library.locator('.header img')).toHaveCount(0);
  await expect(library.locator('.header .account__avatar .icon')).toHaveCount(1);
});

test('Settings is a page of its own, which Back leaves', async ({ context, extensionId }) => {
  const library = await context.newPage();
  await openSeeded(library, extensionId);

  await openSettings(library);
  expect(new URL(library.url()).hash).toBe('#settings');
  await expect(library.getByRole('searchbox')).toHaveCount(0);
  await expect(
    library.getByText(
      '2 posts, 2 tags and 2 tag assignments for X account ···0001; 1 post, 0 tags and 0 tag assignments for X account ···0002.',
    ),
  ).toBeVisible();
  await expect(library.getByText(/^About [\d.,]+ [KMG]B$/)).toBeVisible();

  // The list on the left jumps to a group.
  await library
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('link', { name: 'Danger zone' })
    .click();
  expect(new URL(library.url()).hash).toBe('#settings-danger');
  await expect(library.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();

  // Only `?` works here; `/` has no search to go to.
  await library.keyboard.press('/');
  await library.keyboard.press('?');
  await expect(library.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await library.keyboard.press('Escape');

  await library.goBack();
  await library.goBack();
  await expect(library.getByRole('heading', { level: 1, name: 'Settings' })).toHaveCount(0);
  await expect(texts(library)).toHaveCount(2);
  await expect(library.getByRole('searchbox', { name: 'Search posts' })).toBeVisible();
});

test('below 720 px, sources are pills and tags are chosen in a sheet', async ({
  context,
  extensionId,
}) => {
  const library = await context.newPage();
  await library.setViewportSize({ width: 390, height: 844 });
  await openSeeded(library, extensionId);

  await expect(library.getByRole('navigation', { name: 'Library' })).toBeHidden();
  await expect(library.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();
  const pills = library.getByRole('group', { name: 'Sources' });
  await expect(pills.getByRole('button', { name: 'All posts 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Ticking a tag in the sheet filters the list behind it at once.
  await library.getByRole('button', { name: 'Filters' }).click();
  const sheet = library.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: /^rust/ }).click();
  await expect(sheet.getByRole('button', { name: /^rust/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await sheet.getByRole('button', { name: 'Show 1 post' }).click();
  await expect(sheet).toBeHidden();
  await expect(texts(library)).toHaveText(['A post about rust']);
  await expect(library.getByRole('button', { name: 'Filters, 1 chosen' })).toBeFocused();

  // Two tags: All tags / Any tag appears, and Clear tags empties the choice.
  await library.getByRole('button', { name: 'Filters, 1 chosen' }).click();
  await sheet.getByRole('button', { name: /^bread/ }).click();
  await expect(sheet.getByRole('button', { name: 'Show 0 posts' })).toBeVisible();
  await sheet.getByText('Any tag').click();
  await expect(sheet.getByRole('button', { name: 'Show 2 posts' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Clear tags' }).click();
  await library.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(texts(library)).toHaveCount(2);

  // A source pill.
  await pills.getByRole('button', { name: 'Tagged only 0' }).click();
  await expect(library.getByRole('heading', { name: 'No posts match' })).toBeVisible();
});
