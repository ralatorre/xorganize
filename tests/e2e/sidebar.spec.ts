import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { DAY, VIEWER, openSeeded, storedPost, storedTag } from './seed';

/**
 * The sidebar's tags (DESIGN, 4.5): groups that filter, unused tags, counts
 * in one column, the tag menu, and "+" for a new tag.
 */
const RECORDS = {
  posts: [
    storedPost(VIEWER, '301', 'Rust and Go', { hasTags: 1 }),
    storedPost(VIEWER, '302', 'Only Go', { hasTags: 1 }),
    storedPost(VIEWER, '303', 'About design', { hasTags: 1 }),
  ],
  tags: [
    storedTag('t-rust', 'dev/rust'),
    storedTag('t-go', 'dev/go'),
    storedTag('t-design', 'design'),
    storedTag('t-later', 'later'),
  ],
  postTags: [
    { accountId: VIEWER, postId: '301', tagId: 't-rust', taggedAt: DAY },
    { accountId: VIEWER, postId: '301', tagId: 't-go', taggedAt: DAY },
    { accountId: VIEWER, postId: '302', tagId: 't-go', taggedAt: DAY },
    { accountId: VIEWER, postId: '303', tagId: 't-design', taggedAt: DAY },
  ],
  meta: [{ accountId: '', key: 'activeAccount', value: VIEWER }],
};

const tags = (library: Page) => library.getByRole('region', { name: 'Tags' });

/** A tag or group in the sidebar, by its label. */
const entry = (library: Page, label: string) =>
  tags(library).getByRole('button', { name: new RegExp(`^${label} [\\d,]+$`) });

const count = (library: Page) => library.locator('.toolbar__count');

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error('not on screen');
  return found;
}

/** The right edge of an entry's count. */
const countEnd = async (item: Locator) => {
  const { x, width } = await box(item.locator('.sidebar__count'));
  return Math.round(x + width);
};

test('a group shows every tag in it, unused tags are dimmed, and counts share one column', async ({
  context,
  extensionId,
}) => {
  const library = await context.newPage();
  await openSeeded(library, extensionId, RECORDS, 3);

  // A group counts each of its posts once, and shows them all, matching any tag.
  const dev = entry(library, 'dev');
  await expect(dev).toHaveText(/2$/);
  await dev.click();
  await expect(dev).toHaveAttribute('aria-pressed', 'true');
  await expect(count(library)).toHaveText('2 posts');
  await expect(library.getByRole('radio', { name: 'Any' })).toBeChecked();
  await dev.click();
  await expect(dev).toHaveAttribute('aria-pressed', 'false');
  await expect(count(library)).toHaveText('3 posts');

  // Its arrow folds it.
  await library.getByRole('button', { name: 'dev group' }).click();
  await expect(entry(library, 'rust')).toHaveCount(0);
  await library.getByRole('button', { name: 'dev group' }).click();
  await expect(entry(library, 'rust')).toBeVisible();

  // A tag no post carries is dimmed, with 0.
  const later = entry(library, 'later');
  await expect(later).toHaveText(/0$/);
  const colour = (item: Locator) => item.evaluate((element) => getComputedStyle(element).color);
  expect(await colour(later)).not.toBe(await colour(entry(library, 'design')));

  // Counts line up with each other and with the sources', nested or not.
  const end = await countEnd(library.getByRole('button', { name: /^All posts / }));
  expect(await countEnd(entry(library, 'design'))).toBe(end);
  expect(await countEnd(entry(library, 'rust'))).toBe(end);
  expect(await countEnd(dev)).toBe(end);

  // On hover, the ⋯ takes the count's place.
  const manage = library.getByRole('button', { name: 'Manage design' });
  await expect(manage).toHaveCSS('opacity', '0');
  await entry(library, 'design').hover();
  await expect(manage).toHaveCSS('opacity', '1');
  await expect(entry(library, 'design').locator('.sidebar__count')).toHaveCSS('opacity', '0');
  const { x, width } = await box(manage);
  expect(Math.abs(x + width - end)).toBeLessThanOrEqual(8);

  await expect(tags(library)).toContainText(
    'Ctrl-click or Cmd-click a tag to combine it with others.',
  );
});

test('a tag menu opens whole inside the window, and "+" creates a tag', async ({
  context,
  extensionId,
}) => {
  const library = await context.newPage();
  await openSeeded(library, extensionId, RECORDS, 3);

  // From a right click: focus on its first item, Esc puts it on the ⋯ button.
  await entry(library, 'design').click({ button: 'right' });
  const menu = library.getByRole('menu', { name: 'Manage design' });
  await expect(menu.getByRole('menuitem', { name: 'Rename…' })).toBeFocused();
  await library.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(library.getByRole('button', { name: 'Manage design' })).toBeFocused();

  // With no room below the last tag, the menu opens above it, over the page,
  // where the sidebar's scrolling does not cut it off.
  await library.setViewportSize({ width: 1280, height: 520 });
  const last = entry(library, 'later');
  await last.click({ button: 'right' });
  const lastMenu = library.getByRole('menu', { name: 'Manage later' });
  const opened = await box(lastMenu);
  expect(opened.y + opened.height).toBeLessThanOrEqual(520);
  expect(opened.y + opened.height).toBeLessThanOrEqual((await box(last)).y);
  const remove = lastMenu.getByRole('menuitem', { name: 'Delete tag…' });
  const { x, y, width, height } = await box(remove);
  const hit = await library.evaluate(
    ([px, py]) => document.elementFromPoint(px!, py!)?.textContent ?? '',
    [x + width / 2, y + height / 2],
  );
  expect(hit).toBe('Delete tag…');
  await library.keyboard.press('Escape');

  // "+" asks for a name, refuses one in use, and the new tag shows with 0.
  await tags(library).getByRole('button', { name: 'New tag' }).click();
  const dialog = library.getByRole('dialog', { name: 'New tag' });
  const name = dialog.getByRole('textbox', { name: 'Name' });
  await expect(name).toBeFocused();
  await name.fill('Design');
  await dialog.getByRole('button', { name: 'Create tag' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('A tag with that name already exists.');
  await name.fill('reading');
  await dialog.getByRole('button', { name: 'Create tag' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(entry(library, 'reading')).toHaveText(/0$/);
});
