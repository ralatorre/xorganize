import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { DAY, VIEWER, openSeeded, storedPost, storedTag } from './seed';

const RECORDS = {
  posts: [storedPost(VIEWER, '101', 'A post with no tags')],
  meta: [{ accountId: '', key: 'activeAccount', value: VIEWER }],
};

const photo = (name: string) => ({ kind: 'photo', url: `https://pbs.twimg.com/media/${name}.jpg` });

/** A bookmarked post with three photos and a tag, and a liked one with a video and two tags. */
const CARDS = {
  posts: [
    storedPost(VIEWER, '201', 'Three photos', {
      hasTags: 1,
      media: [photo('one'), photo('two'), photo('three')],
    }),
    storedPost(VIEWER, '202', 'A video', {
      isBookmark: 0,
      isLike: 1,
      likeSort: '202'.padStart(30, '0'),
      hasTags: 1,
      media: [
        {
          kind: 'video',
          url: 'https://video.twimg.com/v.mp4',
          previewUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/still.jpg',
        },
      ],
    }),
  ],
  tags: [storedTag('t-rust', 'rust'), storedTag('t-go', 'go')],
  postTags: [
    { accountId: VIEWER, postId: '201', tagId: 't-rust', taggedAt: DAY },
    { accountId: VIEWER, postId: '202', tagId: 't-rust', taggedAt: DAY },
    { accountId: VIEWER, postId: '202', tagId: 't-go', taggedAt: DAY },
  ],
  meta: [{ accountId: '', key: 'activeAccount', value: VIEWER }],
};

/** A 1×1 PNG. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Whether the point lies on the tag popover, which sits outside the page's own root. */
const onPopover = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const element = document.elementFromPoint(px!, py!);
      return element !== null && element.closest('#app') === null;
    },
    [x, y],
  );

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not on screen');
  return found;
}

test('the tag popover opens from the start of a card’s tag button, clear of the sidebar', async ({
  context,
  extensionId,
}) => {
  const library = await context.newPage();
  await openSeeded(library, extensionId, RECORDS, 1);

  const button = library.getByRole('button', { name: /Add tag/ });
  const { x, y, height } = await box(button);
  await button.click();
  const below = y + height + 40;
  await expect.poll(() => onPopover(library, x + 200, below)).toBe(true);
  expect(await onPopover(library, x - 40, below)).toBe(false);
});

test('cards show why a post is here, its media in one frame, and tags that filter', async ({
  context,
  extensionId,
}) => {
  await context.route('https://pbs.twimg.com/**', async (route) => {
    const headers = await route.request().allHeaders();
    await route.fulfill({
      contentType: 'image/png',
      body: PIXEL,
      headers: { 'access-control-allow-origin': headers.origin ?? '' },
    });
  });
  const library = await context.newPage();
  await openSeeded(library, extensionId, CARDS, 2);
  const card = (text: string) => library.locator('article.post', { hasText: text });

  // Why each post is in the library.
  await expect(card('Three photos').getByRole('img', { name: 'Bookmarked' })).toBeVisible();
  await expect(card('Three photos').getByRole('img', { name: 'Liked' })).toHaveCount(0);
  await expect(card('A video').getByRole('img', { name: 'Liked' })).toBeVisible();

  // Media as X lays it out: three photos in one frame, a video by its still.
  await expect(card('Three photos').locator('.media.media--3 img')).toHaveCount(3);
  await expect(card('A video').locator('.media.media--1')).toContainText('Video');

  // A tag on a card shows its posts; Ctrl-click adds another.
  const summary = library.locator('.toolbar__count');
  await card('A video').getByRole('button', { name: 'go' }).click();
  await expect(summary).toHaveText('1 post');
  await card('A video')
    .getByRole('button', { name: 'rust' })
    .click({ modifiers: ['Control'] });
  await expect(summary).toHaveText('1 post');
  await library.getByRole('radio', { name: 'Any tag' }).check();
  await expect(summary).toHaveText('2 posts');

  // Edit tags in the ⋯ menu opens the popover, and focus stays in it.
  await card('Three photos').getByRole('button', { name: 'More actions' }).click();
  await library.getByRole('menuitem', { name: /Edit tags/ }).click();
  await expect(card('Three photos').getByRole('button', { name: 'Change tags' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect
    .poll(() => library.evaluate(() => document.activeElement?.closest('#app')))
    .toBeNull();
  await library.keyboard.press('Escape');
  await expect(card('Three photos').getByRole('button', { name: 'Change tags' })).toBeFocused();

  // Narrow: denser cards, without media.
  await library.setViewportSize({ width: 390, height: 844 });
  await expect(card('Three photos').locator('.media')).toBeHidden();
});
